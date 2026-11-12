"""EVT/RSVP/AVAIL/TASK/NOTI P0：权限、脱敏、事务和 UTC 时间的唯一实现。"""

import json
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.deps import TeamContext, require_member
from app.errors import ApiError
from app.models import Event, EventParticipant, Notification, Task, TeamMember, User, now_utc
from app.schemas import _utc_iso
from app.schemas_work import EventCreate, EventPatch, TaskCreate, TaskPatch
from app.services.transactions import serialized_write


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def timestamp(value: datetime | None) -> str | None:
    """统一 UTC ISO 8601（带 Z）；与文本既有格式兼容，供前端字符串比较。"""
    return _utc_iso(value) if value else None


def normalized_time(value: str | None) -> str | None:
    """把任意 ISO 字符串规范成 `YYYY-MM-DDTHH:MM:SSZ`；无法解析返回 None。

    数据库可能返回 "." 或 "Z" 两种形式；前端比较自身活动与忙闲块前先调用此函数。
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return _utc_iso(parsed)


def text_value(value: str | None, maximum: int, required: bool = False) -> str | None:
    value = value.strip() if value is not None else None
    if (required and not value) or (value and len(value) > maximum):
        raise ApiError(422, "UNPROCESSABLE_ENTITY", f"文本不能为空且不能超过 {maximum} 字")
    return value


def aware_input(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ApiError(400, "VALIDATION_ERROR", "时间必须包含时区")
    return utc(value)


def active_ids(db: Session, team_id: int) -> set[int]:
    return set(
        db.scalars(
            select(TeamMember.user_id).where(
                TeamMember.team_id == team_id, TeamMember.status == "active"
            )
        )
    )


def validate_ids(db: Session, team_id: int, ids: set[int], code: str) -> None:
    if not ids <= active_ids(db, team_id):
        raise ApiError(422, code, "用户必须是当前团队的活跃成员")


def participants(db: Session, event_id: int) -> list[EventParticipant]:
    return list(
        db.scalars(
            select(EventParticipant)
            .where(EventParticipant.event_id == event_id)
            .order_by(EventParticipant.id)
        )
    )


def can_view(db: Session, event: Event, user_id: int) -> bool:
    # 自愿拒绝有 responded_at，可反悔；被移除的 declined 行无回应时间。
    return (
        event.visibility == "team"
        or event.created_by == user_id
        or any(
            p.user_id == user_id and not (p.response == "declined" and p.responded_at is None)
            for p in participants(db, event.id)
        )
    )


def get_resource(db: Session, model, resource_id: int, user: User):
    resource = db.get(model, resource_id)
    if resource is None or resource.deleted_at is not None:
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    ctx = require_member(resource.team_id, user, db)
    if model is Event and not can_view(db, resource, user.id):
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    return resource, ctx


def can_edit(resource, ctx: TeamContext, user_id: int) -> None:
    if resource.created_by != user_id and ctx.member.role not in ("owner", "admin"):
        raise ApiError(403, "FORBIDDEN", "没有编辑权限")


def notify(
    db: Session,
    user_id: int,
    team_id: int,
    kind: str,
    title: str,
    payload: dict,
    key: str | None = None,
) -> None:
    if user_id not in active_ids(db, team_id):
        return
    db.execute(
        insert(Notification)
        .values(
            user_id=user_id,
            team_id=team_id,
            type=kind,
            title=title,
            payload_json=json.dumps(payload),
            dedupe_key=key,
            created_at=now_utc(),
        )
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
    )


def notify_event(db: Session, event: Event, kind: str, actor: int | None = None) -> None:
    for p in participants(db, event.id):
        if p.user_id != actor and p.response != "declined":
            notify(
                db,
                p.user_id,
                event.team_id,
                kind,
                event.title,
                {"team_id": event.team_id, "event_id": event.id},
            )


def event_out(db: Session, event: Event, user_id: int) -> dict:
    if not can_view(db, event, user_id):
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    people = participants(db, event.id)
    return {
        "id": event.id,
        "series_id": event.series_id,
        "original_start": timestamp(event.original_start),
        "team_id": event.team_id,
        "title": event.title,
        "description": event.description,
        "start_at": timestamp(event.start_at),
        "end_at": timestamp(event.end_at),
        "all_day": event.all_day,
        "location": event.location,
        "color": event.color or db.get(User, event.created_by).avatar_color,
        "visibility": event.visibility,
        "status": event.status,
        "created_by": event.created_by,
        "updated_at": timestamp(event.updated_at),
        "my_needs_confirmation": any(p.user_id == user_id and p.needs_confirmation for p in people),
        "my_response": next((p.response for p in people if p.user_id == user_id), None),
        "participants": [participant_out(db, p) for p in people],
    }


def participant_out(db: Session, p: EventParticipant) -> dict:
    return {
        "user_id": p.user_id,
        "display_name": db.get(User, p.user_id).display_name,
        "response": p.response,
        "is_organizer": p.is_organizer,
        "needs_confirmation": p.needs_confirmation,
    }


def validate_range(start: datetime, end: datetime, days: int) -> tuple[datetime, datetime]:
    start, end = aware_input(start), aware_input(end)
    if end <= start or end - start > timedelta(days=days):
        raise ApiError(422, "INVALID_TIME_RANGE", f"时间范围必须为正且不超过 {days} 天")
    return start, end


def overlapping(db: Session, team_id: int, start: datetime, end: datetime):
    return list(
        db.scalars(
            select(Event)
            .where(
                Event.team_id == team_id,
                Event.deleted_at.is_(None),
                Event.status == "confirmed",
                Event.start_at < end,
                Event.end_at > start,
            )
            .order_by(Event.start_at)
        )
    )


def busy_block(db: Session, event: Event, viewer: int) -> dict:
    visible = can_view(db, event, viewer)
    return {
        "start_at": timestamp(event.start_at),
        "end_at": timestamp(event.end_at),
        "all_day": event.all_day,
        "event_id": event.id if visible else None,
        "title": event.title if visible else None,
        "visibility": event.visibility,
    }


def conflicts(
    db: Session,
    team_id: int,
    ids: set[int],
    start: datetime,
    end: datetime,
    viewer: int,
    exclude: int | None = None,
    exclude_ids: set[int] | None = None,
) -> list[dict]:
    found = []
    for event in overlapping(db, team_id, start, end):
        if event.id == exclude or (exclude_ids and event.id in exclude_ids):
            continue
        for p in participants(db, event.id):
            if p.user_id in ids and p.response != "declined":
                found.append(
                    {
                        "user_id": p.user_id,
                        "display_name": db.get(User, p.user_id).display_name,
                        **busy_block(db, event, viewer),
                    }
                )
    return found


def validate_event(data: dict, timezone: str) -> None:
    data["title"] = text_value(data["title"], 100, True)
    data["description"] = text_value(data.get("description"), 2000)
    data["location"] = text_value(data.get("location"), 2000)
    start, end = aware_input(data["start_at"]), aware_input(data["end_at"])
    if end <= start:
        raise ApiError(422, "INVALID_TIME_RANGE", "结束时间必须晚于开始时间")
    if data["all_day"]:
        zone = ZoneInfo(timezone)
        if any(t.astimezone(zone).time().isoformat() != "00:00:00" for t in (start, end)):
            raise ApiError(422, "INVALID_TIME_RANGE", "全天活动必须从团队时区零点到零点")
    data["start_at"], data["end_at"] = start, end


def create_event(
    db: Session, ctx: TeamContext, user: User, payload: EventCreate, *, commit: bool = True
) -> dict:
    if (
        db.scalar(
            select(func.count())
            .select_from(Event)
            .where(Event.team_id == ctx.team.id, Event.deleted_at.is_(None))
        )
        >= 10000
    ):
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "团队活动数量已达上限")
    data = payload.model_dump(exclude={"participant_ids", "ignore_conflicts", "recurrence"})
    validate_event(data, ctx.team.timezone)
    ids = set(payload.participant_ids) | {user.id}
    validate_ids(db, ctx.team.id, ids, "INVALID_PARTICIPANT")
    found = conflicts(db, ctx.team.id, ids, data["start_at"], data["end_at"], user.id)
    if found and not payload.ignore_conflicts:
        raise ApiError(409, "TIME_CONFLICT", "所选成员已有安排", {"conflicts": found})
    event = Event(team_id=ctx.team.id, created_by=user.id, **data)
    db.add(event)
    db.flush()
    for uid in sorted(ids):
        db.add(
            EventParticipant(
                event_id=event.id,
                user_id=uid,
                response="accepted" if uid == user.id else "pending",
                is_organizer=uid == user.id,
            )
        )
    db.flush()
    notify_event(db, event, "event.invited", user.id)
    if now_utc() < utc(event.start_at) <= now_utc() + timedelta(minutes=15):
        for uid in ids:
            notify(
                db,
                uid,
                event.team_id,
                "event.reminder",
                event.title,
                {"team_id": event.team_id, "event_id": event.id},
                f"event.reminder:{uid}:{event.id}:15m:{timestamp(event.start_at)}",
            )
    if commit:
        db.commit()
    else:
        db.flush()
    return event_out(db, event, user.id)


def patch_event(
    db: Session,
    event: Event,
    ctx: TeamContext,
    user: User,
    payload: EventPatch,
    *,
    commit: bool = True,
) -> dict:
    can_edit(event, ctx, user.id)
    if event.status == "cancelled":
        raise ApiError(409, "EVENT_CANCELLED", "活动已取消")
    changes = payload.model_dump(exclude_unset=True, exclude={"ignore_conflicts", "scope"})
    for key in ("title", "start_at", "end_at", "all_day", "visibility", "status"):
        if key in changes and changes[key] is None:
            raise ApiError(400, "VALIDATION_ERROR", "必填字段不能为 null")
    changed_time = any(
        k in changes
        and (
            aware_input(changes[k]) != utc(getattr(event, k))
            if k in ("start_at", "end_at") and changes[k] is not None
            else changes[k] != getattr(event, k)
        )
        for k in ("start_at", "end_at", "location")
    )
    if changed_time and utc(event.start_at) <= now_utc():
        raise ApiError(422, "EVENT_ALREADY_STARTED", "活动开始后不能修改时间或地点")
    data = {
        k: getattr(event, k)
        for k in (
            "title",
            "description",
            "start_at",
            "end_at",
            "all_day",
            "location",
            "color",
            "visibility",
            "status",
        )
    }
    data.update(changes)
    # SQLite 回读时间补 UTC，输入的无时区时间仍拒绝。
    for key in ("start_at", "end_at"):
        if key not in changes:
            data[key] = utc(data[key])
    validate_event(data, ctx.team.timezone)
    ids = {p.user_id for p in participants(db, event.id) if p.response != "declined"}
    found = conflicts(db, event.team_id, ids, data["start_at"], data["end_at"], user.id, event.id)
    if changed_time and data["status"] != "cancelled" and found and not payload.ignore_conflicts:
        raise ApiError(409, "TIME_CONFLICT", "所选成员已有安排", {"conflicts": found})
    for key, value in data.items():
        setattr(event, key, value)
    if event.status == "cancelled":
        for p in participants(db, event.id):
            p.needs_confirmation = False
        notify_event(db, event, "event.cancelled", user.id)
    elif changed_time:
        for p in participants(db, event.id):
            if not p.is_organizer and p.response in ("accepted", "tentative"):
                p.response, p.responded_at, p.needs_confirmation = "pending", None, True
                notify(
                    db,
                    p.user_id,
                    event.team_id,
                    "event.updated",
                    f"「{event.title}」时间/地点已变更，请重新确认",
                    {"team_id": event.team_id, "event_id": event.id},
                )
    if commit:
        db.commit()
    else:
        db.flush()
    return event_out(db, event, user.id)


def ensure_open(event: Event) -> None:
    if event.status == "cancelled":
        raise ApiError(409, "EVENT_CANCELLED", "活动已取消")
    if utc(event.end_at) <= now_utc():
        raise ApiError(409, "EVENT_ENDED", "活动已结束")


def invite(db: Session, event: Event, ctx: TeamContext, user: User, ids: list[int]) -> dict:
    can_edit(event, ctx, user.id)
    ensure_open(event)
    validate_ids(db, event.team_id, set(ids), "INVALID_PARTICIPANT")
    for uid in set(ids):
        old = db.scalar(
            select(EventParticipant).where(
                EventParticipant.event_id == event.id, EventParticipant.user_id == uid
            )
        )
        if old is not None:
            if old.response == "declined" and old.responded_at is None:
                old.response, old.invited_at = "pending", now_utc()
                old.needs_confirmation = False
                notify(
                    db,
                    uid,
                    event.team_id,
                    "event.invited",
                    event.title,
                    {"team_id": event.team_id, "event_id": event.id},
                )
            continue
        db.execute(
            insert(EventParticipant)
            .values(
                event_id=event.id,
                user_id=uid,
                response="pending",
                is_organizer=False,
                invited_at=now_utc(),
            )
            .on_conflict_do_nothing(index_elements=["event_id", "user_id"])
        )
        notify(
            db,
            uid,
            event.team_id,
            "event.invited",
            event.title,
            {"team_id": event.team_id, "event_id": event.id},
        )
    db.commit()
    items = [participant_out(db, p) for p in participants(db, event.id)]
    return {"items": items, "total": len(items)}


@serialized_write
def rsvp(db: Session, event: Event, user: User, response: str) -> dict:
    ensure_open(event)
    p = next((p for p in participants(db, event.id) if p.user_id == user.id), None)
    if p is None or (p.response == "declined" and p.responded_at is None):
        raise ApiError(403, "FORBIDDEN", "只有当前受邀参与者可以回应")
    if p.is_organizer and response != "accepted":
        raise ApiError(422, "ORGANIZER_CANNOT_DECLINE", "组织者请取消活动")
    p.response, p.responded_at = response, now_utc()
    p.needs_confirmation = False
    db.commit()
    return participant_out(db, p)


def task_out(db: Session, task: Task) -> dict:
    from app.services.dependencies import summary

    assignee = db.get(User, task.assignee_id) if task.assignee_id else None
    return {
        "id": task.id,
        "team_id": task.team_id,
        "title": task.title,
        "description": task.description,
        "assignee_id": task.assignee_id,
        "assignee_name": assignee.display_name if assignee else None,
        **summary(db, task),
        "due_at": timestamp(task.due_at),
        "priority": task.priority,
        "status": task.status,
        "overdue": utc(task.due_at) < now_utc() and task.status != "done",
        "created_by": task.created_by,
        "completed_at": timestamp(task.completed_at),
        "updated_at": timestamp(task.updated_at),
    }


@serialized_write
def create_task(db: Session, ctx: TeamContext, user: User, payload: TaskCreate) -> dict:
    validate_ids(db, ctx.team.id, {payload.assignee_id}, "INVALID_ASSIGNEE")
    data = payload.model_dump(exclude={"dependency_ids"})
    data["title"] = text_value(data["title"], 100, True)
    data["description"] = text_value(data["description"], 2000)
    data["due_at"] = aware_input(data["due_at"])
    task = Task(team_id=ctx.team.id, created_by=user.id, **data)
    db.add(task)
    db.flush()
    from app.services.dependencies import set_dependencies

    set_dependencies(db, task, payload.dependency_ids)
    notify(
        db,
        task.assignee_id,
        task.team_id,
        "task.assigned",
        task.title,
        {"team_id": task.team_id, "task_id": task.id},
    )
    db.commit()
    return task_out(db, task)


@serialized_write
def patch_task(db: Session, task: Task, ctx: TeamContext, user: User, payload: TaskPatch) -> dict:
    changes = payload.model_dump(exclude_unset=True)
    if set(changes) - {"status"}:
        can_edit(task, ctx, user.id)
    elif task.assignee_id != user.id:
        can_edit(task, ctx, user.id)
    for key in ("title", "due_at", "priority", "status", "assignee_id"):
        if key in changes and changes[key] is None:
            raise ApiError(422, "UNPROCESSABLE_ENTITY", "必填字段不能为空")
    from app.services.dependencies import check_status, set_dependencies

    if "dependency_ids" in changes:
        set_dependencies(db, task, changes.pop("dependency_ids"))
    if "status" in changes:
        check_status(db, task, changes["status"])
    if "assignee_id" in changes:
        validate_ids(db, task.team_id, {changes["assignee_id"]}, "INVALID_ASSIGNEE")
        if task.assignee_id != changes["assignee_id"]:
            notify(
                db,
                changes["assignee_id"],
                task.team_id,
                "task.assigned",
                task.title,
                {"team_id": task.team_id, "task_id": task.id},
            )
    if "title" in changes:
        changes["title"] = text_value(changes["title"], 100, True)
    if "description" in changes:
        changes["description"] = text_value(changes["description"], 2000)
    if "due_at" in changes:
        changes["due_at"] = aware_input(changes["due_at"])
    if "status" in changes:
        task.completed_at = now_utc() if changes["status"] == "done" else None
    for key, value in changes.items():
        setattr(task, key, value)
    db.commit()
    return task_out(db, task)
