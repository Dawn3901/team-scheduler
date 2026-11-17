"""CR-016：沟通端点（通告、对象内消息、读位、收件箱）。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import AdminContext, CurrentUser, MemberContext
from app.schemas_message import (
    AnnouncementCreate,
    AnnouncementPatch,
    MessageCreate,
    ReadMark,
)
from app.services import announcements, messages
from app.services import inbox as inbox_service

router = APIRouter(tags=["messaging"])

Db = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


# ---------- 通告 ----------


@router.get("/teams/{team_id}/announcements")
def list_announcements(
    ctx: MemberContext, user: CurrentUser, db: Db, limit: Limit = 20, offset: Offset = 0
):
    return announcements.list_announcements(db, ctx, user, limit=limit, offset=offset)


@router.post("/teams/{team_id}/announcements", status_code=201)
def create_announcement(ctx: AdminContext, user: CurrentUser, db: Db, payload: AnnouncementCreate):
    return announcements.create_announcement(
        db,
        ctx,
        user,
        title=payload.title,
        body=payload.body,
        pinned=payload.pinned,
        requires_ack=payload.requires_ack,
        expires_at=payload.expires_at,
    )


@router.get("/announcements/{announcement_id}")
def get_announcement(announcement_id: int, user: CurrentUser, db: Db):
    return announcements.get_announcement(db, user, announcement_id)


@router.patch("/announcements/{announcement_id}")
def patch_announcement(
    announcement_id: int, user: CurrentUser, db: Db, payload: AnnouncementPatch
):
    return announcements.patch_announcement(
        db, user, announcement_id, changes=payload.model_dump(exclude_unset=True)
    )


@router.delete("/announcements/{announcement_id}", status_code=204)
def delete_announcement(announcement_id: int, user: CurrentUser, db: Db):
    announcements.delete_announcement(db, user, announcement_id)
    return Response(status_code=204)


@router.post("/announcements/{announcement_id}/ack")
def ack_announcement(announcement_id: int, user: CurrentUser, db: Db):
    return announcements.ack(db, user, announcement_id)


@router.get("/announcements/{announcement_id}/receipts")
def announcement_receipts(announcement_id: int, user: CurrentUser, db: Db):
    return announcements.receipts(db, user, announcement_id)


# ---------- 对象内消息 ----------


@router.get("/events/{event_id}/messages")
def list_event_messages(
    event_id: int,
    user: CurrentUser,
    db: Db,
    before_id: int | None = None,
    limit: Limit = 50,
):
    return messages.list_messages(
        db, user, "event", event_id, before_id=before_id, limit=limit
    )


@router.post("/events/{event_id}/messages", status_code=201)
def create_event_message(event_id: int, user: CurrentUser, db: Db, payload: MessageCreate):
    return messages.create_message(
        db,
        user,
        "event",
        event_id,
        body=payload.body,
        kind=payload.kind,
        mention_user_ids=payload.mention_user_ids,
    )


@router.get("/tasks/{task_id}/messages")
def list_task_messages(
    task_id: int,
    user: CurrentUser,
    db: Db,
    before_id: int | None = None,
    limit: Limit = 50,
):
    return messages.list_messages(db, user, "task", task_id, before_id=before_id, limit=limit)


@router.post("/tasks/{task_id}/messages", status_code=201)
def create_task_message(task_id: int, user: CurrentUser, db: Db, payload: MessageCreate):
    return messages.create_message(
        db,
        user,
        "task",
        task_id,
        body=payload.body,
        kind=payload.kind,
        mention_user_ids=payload.mention_user_ids,
    )


# ---------- 读位与收件箱 ----------


@router.post("/read-marks", status_code=204)
def mark_read(payload: ReadMark, user: CurrentUser, db: Db):
    messages.target_context(db, user, payload.target_type, payload.target_id)
    messages.mark_read(db, user, payload.target_type, payload.target_id)
    return Response(status_code=204)


@router.get("/inbox")
def inbox(user: CurrentUser, db: Db):
    return inbox_service.inbox(db, user)
