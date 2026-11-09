"""EVT-10：有界物化系列，批量写入只有一个提交点。"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import TeamContext
from app.errors import ApiError
from app.models import Event, EventSeries, User, now_utc
from app.schemas_work import EventCreate, EventPatch
from app.services import work
from app.services.transactions import serialized_write


def wall_to_utc(value: datetime, zone: ZoneInfo) -> datetime:
    wall = value.replace(tzinfo=None)
    first = wall.replace(tzinfo=zone, fold=0).astimezone(UTC)
    second = wall.replace(tzinfo=zone, fold=1).astimezone(UTC)
    valid = [t for t in (first, second) if t.astimezone(zone).replace(tzinfo=None) == wall]
    if not valid or (first != second and len(set(valid)) > 1):
        raise ApiError(422, "INVALID_RECURRENCE", "重复时段遇到夏令时缺失或歧义，请调整钟点")
    return valid[0]


@serialized_write
def create(db: Session, ctx: TeamContext, user: User, payload: EventCreate) -> dict:
    rule = payload.recurrence
    if rule is None:
        return work.create_event(db, ctx, user, payload)
    if (rule.count is None) == (rule.until is None) or (
        rule.count is not None and not 1 <= rule.count <= 52
    ):
        raise ApiError(422, "INVALID_RECURRENCE", "次数1–52或结束日期二选一")
    zone = ZoneInfo(ctx.team.timezone)
    start = work.aware_input(payload.start_at).astimezone(zone).replace(tzinfo=None)
    end = work.aware_input(payload.end_at).astimezone(zone).replace(tzinfo=None)
    if rule.until and (
        rule.until < start.date() or rule.until > (start + timedelta(days=365)).date()
    ):
        raise ApiError(422, "INVALID_RECURRENCE", "结束日期应在开始日至一年内")
    step = 7 if rule.frequency == "weekly" else 14
    count = rule.count or ((rule.until - start.date()).days // step + 1)
    if count > 52 or (count - 1) * step > 365:
        raise ApiError(422, "INVALID_RECURRENCE", "最多52次且跨度不超过一年")
    series = EventSeries(
        team_id=ctx.team.id,
        frequency=rule.frequency,
        interval_weeks=step // 7,
        count=count,
        until=rule.until,
        timezone=ctx.team.timezone,
        created_by=user.id,
    )
    try:
        db.add(series)
        db.flush()
        created = []
        for index in range(count):
            data = payload.model_dump(exclude={"recurrence"})
            data["start_at"] = wall_to_utc(start + timedelta(days=index * step), zone)
            data["end_at"] = wall_to_utc(end + timedelta(days=index * step), zone)
            result = work.create_event(db, ctx, user, EventCreate(**data), commit=False)
            event = db.get(Event, result["id"])
            event.series_id, event.original_start = series.id, event.start_at
            created.append(event)
        db.commit()
        return {**work.event_out(db, created[0], user.id), "series_count": count}
    except Exception:
        db.rollback()
        raise


def targets(db: Session, event: Event, scope: str) -> list[Event]:
    if scope == "this":
        return [event]
    if not event.series_id:
        raise ApiError(422, "INVALID_RECURRENCE", "此活动不属于重复系列")
    query = select(Event).where(
        Event.series_id == event.series_id,
        Event.team_id == event.team_id,
        Event.deleted_at.is_(None),
        Event.status == "confirmed",
        Event.start_at > now_utc(),
    )
    if scope == "future":
        query = query.where(Event.original_start >= (event.original_start or event.start_at))
    return list(db.scalars(query.order_by(Event.start_at)))


@serialized_write
def patch(db: Session, event: Event, ctx: TeamContext, user: User, payload: EventPatch) -> dict:
    if payload.scope == "this":
        return work.patch_event(db, event, ctx, user, payload)
    work.can_edit(event, ctx, user.id)
    selected = targets(db, event, payload.scope)
    if not selected:
        raise ApiError(409, "EVENT_ENDED", "没有可修改的未来实例")
    zone = ZoneInfo(ctx.team.timezone)
    changes = payload.model_dump(exclude_unset=True, exclude={"scope", "ignore_conflicts"})
    patches = []
    for item in selected:
        work.can_edit(item, ctx, user.id)
        if not work.can_view(db, item, user.id):
            raise ApiError(404, "NOT_FOUND", "实例不可见")
        data = dict(changes)
        for key in ("start_at", "end_at"):
            if key in changes:
                if changes[key] is None:
                    raise ApiError(400, "VALIDATION_ERROR", "时间不能为空")
                delta = work.aware_input(changes[key]).astimezone(zone).replace(
                    tzinfo=None
                ) - work.utc(getattr(event, key)).astimezone(zone).replace(tzinfo=None)
                wall = work.utc(getattr(item, key)).astimezone(zone).replace(tzinfo=None) + delta
                data[key] = wall_to_utc(wall, zone)
        patches.append((item, data))
    excluded = {item.id for item in selected}
    found = []
    actual_time_change = any(
        key in changes
        and (
            work.aware_input(changes[key]) != work.utc(getattr(event, key))
            if key in ("start_at", "end_at") and changes[key] is not None
            else changes[key] != getattr(event, key)
        )
        for key in ("start_at", "end_at", "location")
    )
    if actual_time_change and changes.get("status") != "cancelled":
        for item, data in patches:
            ids = {p.user_id for p in work.participants(db, item.id) if p.response != "declined"}
            a, b = (
                data.get("start_at", work.utc(item.start_at)),
                data.get("end_at", work.utc(item.end_at)),
            )
            found.extend(work.conflicts(db, item.team_id, ids, a, b, user.id, exclude_ids=excluded))
        # 同一次批量修改的新实例之间也需要冲突检测。
        for index, (left, ldata) in enumerate(patches):
            la, lb = (
                ldata.get("start_at", work.utc(left.start_at)),
                ldata.get("end_at", work.utc(left.end_at)),
            )
            lids = {p.user_id for p in work.participants(db, left.id) if p.response != "declined"}
            for right, rdata in patches[index + 1 :]:
                ra, rb = (
                    rdata.get("start_at", work.utc(right.start_at)),
                    rdata.get("end_at", work.utc(right.end_at)),
                )
                rids = {
                    p.user_id for p in work.participants(db, right.id) if p.response != "declined"
                }
                if la < rb and lb > ra and lids & rids:
                    found.append(
                        {
                            "user_id": min(lids & rids),
                            "start_at": work.timestamp(ra),
                            "end_at": work.timestamp(rb),
                            "title": "系列实例相互重叠",
                            "event_id": right.id,
                            "display_name": "共同参与者",
                        }
                    )
    if found and not payload.ignore_conflicts:
        raise ApiError(409, "TIME_CONFLICT", "系列存在时间冲突", {"conflicts": found})
    try:
        for item, data in patches:
            work.patch_event(
                db, item, ctx, user, EventPatch(**data, ignore_conflicts=True), commit=False
            )
        series = db.get(EventSeries, event.series_id)
        series.updated_at = now_utc()
        db.commit()
        return {**work.event_out(db, event, user.id), "affected_count": len(selected)}
    except Exception:
        db.rollback()
        raise


@serialized_write
def delete(db: Session, event: Event, ctx: TeamContext, user: User, scope: str) -> None:
    work.can_edit(event, ctx, user.id)
    selected = targets(db, event, scope)
    try:
        for item in selected:
            work.can_edit(item, ctx, user.id)
            if not work.can_view(db, item, user.id):
                raise ApiError(404, "NOT_FOUND", "实例不可见")
            work.notify_event(db, item, "event.cancelled", user.id)
            item.status, item.deleted_at = "cancelled", now_utc()
            for person in work.participants(db, item.id):
                person.needs_confirmation = False
        db.commit()
    except Exception:
        db.rollback()
        raise
