"""P0 业务 HTTP 入口；权限和业务规则委托 service。"""

import json
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser, MemberContext
from app.errors import ApiError
from app.models import Event, EventParticipant, Notification, Task, User, now_utc
from app.schemas_work import (
    EventCreate,
    EventPatch,
    InviteRequest,
    RsvpRequest,
    TaskCreate,
    TaskPatch,
)
from app.services import dependencies, personal, recurrence
from app.services import work as service
from app.services.suggestions import suggestions

router = APIRouter(tags=["collaboration"])
Db = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
From = Annotated[datetime, Query(alias="from")]
To = Annotated[datetime, Query(alias="to")]


def ids_query(raw: str | None) -> set[int]:
    try:
        return {int(x) for x in raw.split(",")} if raw else set()
    except ValueError:
        raise ApiError(400, "VALIDATION_ERROR", "成员编号格式不正确") from None


@router.get("/teams/{team_id}/events")
def list_events(
    ctx: MemberContext,
    user: CurrentUser,
    db: Db,
    start: From,
    end: To,
    member_ids: str | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    start, end = service.validate_range(start, end, 92)
    ids = ids_query(member_ids)
    events = db.scalars(
        select(Event)
        .where(
            Event.team_id == ctx.team.id,
            Event.deleted_at.is_(None),
            Event.start_at < end,
            Event.end_at > start,
        )
        .order_by(Event.start_at, Event.id)
    ).all()
    visible = [
        e
        for e in events
        if service.can_view(db, e, user.id)
        and (not ids or ids & {p.user_id for p in service.participants(db, e.id)})
    ]
    return {
        "items": [service.event_out(db, e, user.id) for e in visible[offset : offset + limit]],
        "total": len(visible),
    }


@router.post("/teams/{team_id}/events", status_code=201)
def create_event(ctx: MemberContext, user: CurrentUser, db: Db, payload: EventCreate):
    return recurrence.create(db, ctx, user, payload)


@router.get("/events/{event_id}")
def get_event(event_id: int, user: CurrentUser, db: Db):
    event, _ = service.get_resource(db, Event, event_id, user)
    return service.event_out(db, event, user.id)


@router.patch("/events/{event_id}")
def patch_event(event_id: int, user: CurrentUser, db: Db, payload: EventPatch):
    event, ctx = service.get_resource(db, Event, event_id, user)
    return recurrence.patch(db, event, ctx, user, payload)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: int, user: CurrentUser, db: Db, scope: Literal["this", "future", "all"] = "this"
):
    event, ctx = service.get_resource(db, Event, event_id, user)
    recurrence.delete(db, event, ctx, user, scope)
    return Response(status_code=204)


@router.post("/events/{event_id}/participants")
def invite(event_id: int, user: CurrentUser, db: Db, payload: InviteRequest):
    event, ctx = service.get_resource(db, Event, event_id, user)
    return service.invite(db, event, ctx, user, payload.user_ids)


@router.delete("/events/{event_id}/participants/{user_id}", status_code=204)
def remove_participant(event_id: int, user_id: int, user: CurrentUser, db: Db):
    event, ctx = service.get_resource(db, Event, event_id, user)
    service.can_edit(event, ctx, user.id)
    person = db.scalar(
        select(EventParticipant).where(
            EventParticipant.event_id == event.id, EventParticipant.user_id == user_id
        )
    )
    if person is None:
        raise ApiError(404, "NOT_FOUND", "参与者不存在")
    if person.is_organizer:
        raise ApiError(422, "ORGANIZER_CANNOT_DECLINE", "不能移除组织者")
    person.response, person.responded_at = "declined", None
    person.needs_confirmation = False
    service.notify(
        db,
        user_id,
        event.team_id,
        "event.cancelled",
        "活动邀请已移除",
        {"team_id": event.team_id, "event_id": event.id},
    )
    db.commit()
    return Response(status_code=204)


@router.patch("/events/{event_id}/rsvp")
def rsvp(event_id: int, user: CurrentUser, db: Db, payload: RsvpRequest):
    event, _ = service.get_resource(db, Event, event_id, user)
    return service.rsvp(db, event, user, payload.response)


@router.get("/teams/{team_id}/availability")
def availability(
    ctx: MemberContext, user: CurrentUser, db: Db, start: From, end: To, user_ids: str | None = None
):
    start, end = service.validate_range(start, end, 31)
    ids = ids_query(user_ids) or service.active_ids(db, ctx.team.id)
    service.validate_ids(db, ctx.team.id, ids, "INVALID_PARTICIPANT")
    members = []
    events = service.overlapping(db, ctx.team.id, start, end)
    personal_busy = personal.team_busy_blocks(db, ctx.team.id, ids, start, end)
    for uid in sorted(ids):
        blocks = []
        for event in events:
            if any(
                p.user_id == uid and p.response != "declined"
                for p in service.participants(db, event.id)
            ):
                blocks.append({**service.busy_block(db, event, user.id), "busy": True})
        blocks.extend(personal_busy.get(uid, []))
        blocks.sort(key=lambda block: block["start_at"] or "")
        members.append(
            {"user_id": uid, "display_name": db.get(User, uid).display_name, "blocks": blocks}
        )
    return {"from": service.timestamp(start), "to": service.timestamp(end), "members": members}


@router.get("/teams/{team_id}/tasks")
def list_tasks(
    ctx: MemberContext,
    user: CurrentUser,
    db: Db,
    status: Literal["todo", "doing", "done"] | None = None,
    assignee_id: int | None = None,
    mine: bool = False,
    limit: Limit = 20,
    offset: Offset = 0,
):
    query = select(Task).where(Task.team_id == ctx.team.id, Task.deleted_at.is_(None))
    if status:
        query = query.where(Task.status == status)
    if assignee_id is not None or mine:
        query = query.where(Task.assignee_id == (user.id if mine else assignee_id))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(Task.due_at, Task.id).offset(offset).limit(limit))
    return {"items": [service.task_out(db, t) for t in items], "total": total}


@router.post("/teams/{team_id}/tasks", status_code=201)
def create_task(ctx: MemberContext, user: CurrentUser, db: Db, payload: TaskCreate):
    return service.create_task(db, ctx, user, payload)


@router.patch("/tasks/{task_id}")
def patch_task(task_id: int, user: CurrentUser, db: Db, payload: TaskPatch):
    task, ctx = service.get_resource(db, Task, task_id, user)
    return service.patch_task(db, task, ctx, user, payload)


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, user: CurrentUser, db: Db):
    return patch_task(task_id, user, db, TaskPatch(status="done"))


@router.post("/tasks/{task_id}/reopen")
def reopen_task(task_id: int, user: CurrentUser, db: Db):
    return patch_task(task_id, user, db, TaskPatch(status="todo"))


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, user: CurrentUser, db: Db):
    task, ctx = service.get_resource(db, Task, task_id, user)
    service.can_edit(task, ctx, user.id)
    dependencies.check_delete(db, task)
    task.deleted_at = now_utc()
    db.commit()
    return Response(status_code=204)


@router.get("/notifications")
def notifications(
    user: CurrentUser, db: Db, unread_only: bool = False, limit: Limit = 20, offset: Offset = 0
):
    query = select(Notification).where(Notification.user_id == user.id)
    unread = db.scalar(
        select(func.count()).select_from(query.where(Notification.read_at.is_(None)).subquery())
    )
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return {
        "items": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "payload": json.loads(n.payload_json or "{}"),
                "read_at": service.timestamp(n.read_at),
                "created_at": service.timestamp(n.created_at),
            }
            for n in rows
        ],
        "total": total,
        "unread_count": unread,
    }


@router.post("/notifications/read-all", status_code=204)
def read_all(user: CurrentUser, db: Db):
    for n in db.scalars(
        select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    ):
        n.read_at = now_utc()
    db.commit()
    return Response(status_code=204)


@router.post("/notifications/{notification_id}/read", status_code=204)
def read_notification(notification_id: int, user: CurrentUser, db: Db):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise ApiError(404, "NOT_FOUND", "通知不存在")
    n.read_at = n.read_at or now_utc()
    db.commit()
    return Response(status_code=204)


@router.get("/teams/{team_id}/availability/suggestions")
def suggest_times(
    ctx: MemberContext,
    db: Db,
    start: From,
    end: To,
    duration_minutes: int,
    member_ids: str | None = None,
    required_ids: str | None = None,
    work_start: str = "09:00",
    work_end: str = "18:00",
    buffer_minutes: int = 0,
    include_weekend: bool = False,
):
    return suggestions(
        db,
        ctx,
        start,
        end,
        duration_minutes,
        ids_query(member_ids) if member_ids is not None else None,
        ids_query(required_ids) if required_ids is not None else None,
        work_start,
        work_end,
        buffer_minutes,
        include_weekend,
    )


@router.get("/teams/{team_id}/tasks/dependency-graph")
def dependency_graph(ctx: MemberContext, db: Db):
    return dependencies.graph_out(db, ctx.team.id)
