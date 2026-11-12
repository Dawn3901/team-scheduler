"""CR-002 / CAL-9：个人日历 CRUD、范围校验与团队忙闲合并（仅 owner 可见详情）。"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import PersonalEvent, TeamMember, User, now_utc
from app.schemas_personal import PersonalEventCreate, PersonalEventPatch
from app.services.work import aware_input, text_value, timestamp, validate_range

MAX_RANGE_DAYS = 92


def get_owned(db: Session, event_id: int, user: User) -> PersonalEvent:
    """他人 id 与不存在一律 404，避免用 403 枚举他人个人事件。"""
    event = db.get(PersonalEvent, event_id)
    if event is None or event.deleted_at is not None or event.user_id != user.id:
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    return event


def event_out(event: PersonalEvent) -> dict:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "start_at": timestamp(event.start_at),
        "end_at": timestamp(event.end_at),
        "all_day": bool(event.all_day),
        "location": event.location,
        "color": event.color,
        "share_busy": bool(event.share_busy),
        "updated_at": timestamp(event.updated_at),
    }


def list_range(db: Session, user: User, start: datetime, end: datetime) -> list[PersonalEvent]:
    start, end = validate_range(start, end, MAX_RANGE_DAYS)
    return list(
        db.scalars(
            select(PersonalEvent)
            .where(
                PersonalEvent.user_id == user.id,
                PersonalEvent.deleted_at.is_(None),
                PersonalEvent.start_at < end,
                PersonalEvent.end_at > start,
            )
            .order_by(PersonalEvent.start_at, PersonalEvent.id)
        )
    )


def _validate_times(
    start: datetime,
    end: datetime,
    all_day: bool,
    user: User,
    *,
    from_db: bool,
) -> tuple[datetime, datetime]:
    # SQLite 读回的是 naive UTC；只有 PATCH 未改动的库内值才按 UTC 补时区。
    # 请求体里的 naive 时间必须拒绝（400），与团队活动口径一致。
    if from_db:
        start = start.replace(tzinfo=UTC) if start.tzinfo is None else start
        end = end.replace(tzinfo=UTC) if end.tzinfo is None else end
    start, end = aware_input(start), aware_input(end)
    if end <= start:
        raise ApiError(422, "INVALID_TIME_RANGE", "结束时间必须晚于开始时间")
    if all_day:
        zone = _user_zone(user)
        local_start = start.astimezone(zone)
        local_end = end.astimezone(zone)
        if (
            local_start.time() != datetime.min.time()
            or local_end.time() != datetime.min.time()
            or local_end <= local_start
        ):
            raise ApiError(
                422,
                "INVALID_TIME_RANGE",
                "全天事件需按用户时区从 00:00 到次日 00:00",
            )
    if end - start > timedelta(days=366):
        raise ApiError(422, "INVALID_TIME_RANGE", "单个事件跨度不能超过 366 天")
    return start, end


def _user_zone(user: User):
    from zoneinfo import ZoneInfo

    try:
        return ZoneInfo(user.timezone or "Asia/Shanghai")
    except Exception:  # noqa: BLE001 - 时区数据异常时回退团队默认，不阻断保存
        return ZoneInfo("Asia/Shanghai")


def create(db: Session, user: User, payload: PersonalEventCreate) -> PersonalEvent:
    start, end = _validate_times(
        payload.start_at, payload.end_at, payload.all_day, user, from_db=False
    )
    event = PersonalEvent(
        user_id=user.id,
        title=text_value(payload.title, 100, required=True),
        description=text_value(payload.description, 2000),
        start_at=start,
        end_at=end,
        all_day=payload.all_day,
        location=text_value(payload.location, 200),
        color=payload.color,
        share_busy=payload.share_busy,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def patch(
    db: Session, event: PersonalEvent, user: User, payload: PersonalEventPatch
) -> PersonalEvent:
    data = payload.model_dump(exclude_unset=True)
    start = data.get("start_at", event.start_at)
    end = data.get("end_at", event.end_at)
    all_day = data.get("all_day", event.all_day)
    start, end = _validate_times(
        data.get("start_at", event.start_at),
        data.get("end_at", event.end_at),
        bool(all_day),
        user,
        from_db="start_at" not in data and "end_at" not in data,
    )
    event.start_at, event.end_at, event.all_day = start, end, bool(all_day)
    if "title" in data:
        event.title = text_value(data["title"], 100, required=True)
    if "description" in data:
        event.description = text_value(data["description"], 2000)
    if "location" in data:
        event.location = text_value(data["location"], 200)
    if "color" in data:
        event.color = data["color"]
    if "share_busy" in data:
        event.share_busy = bool(data["share_busy"])
    event.updated_at = now_utc()
    db.commit()
    db.refresh(event)
    return event


def delete(db: Session, event: PersonalEvent) -> None:
    event.deleted_at = now_utc()
    event.updated_at = now_utc()
    db.commit()


def team_busy_blocks(
    db: Session, team_id: int, user_ids: set[int], start: datetime, end: datetime
) -> dict[int, list[dict]]:
    """团队忙闲合并：只取 share_busy、未删除、且用户是该团队活跃成员的个人事件。

    隐私：只返回时间段与 busy=true，event_id/title/地点/描述一律不下发。
    """
    if not user_ids:
        return {}
    team_members = set(
        db.scalars(
            select(TeamMember.user_id).where(
                TeamMember.team_id == team_id, TeamMember.status == "active"
            )
        )
    )
    ids = user_ids & team_members
    if not ids:
        return {}
    rows = db.scalars(
        select(PersonalEvent)
        .where(
            PersonalEvent.user_id.in_(ids),
            PersonalEvent.share_busy.is_(True),
            PersonalEvent.deleted_at.is_(None),
            PersonalEvent.start_at < end,
            PersonalEvent.end_at > start,
        )
        .order_by(PersonalEvent.start_at, PersonalEvent.id)
    )
    result: dict[int, list[dict]] = {uid: [] for uid in ids}
    for row in rows:
        result[row.user_id].append(
            {
                "start_at": timestamp(row.start_at),
                "end_at": timestamp(row.end_at),
                "all_day": bool(row.all_day),
                "event_id": None,
                "title": None,
                "visibility": "private",
                "busy": True,
            }
        )
    return result


__all__ = [
    "create",
    "delete",
    "event_out",
    "get_owned",
    "list_range",
    "patch",
    "team_busy_blocks",
]
