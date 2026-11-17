"""CR-016 / MSG-3：收件箱。

聚合三类"需要我处理的事"：
1. 我所属团队里、需要回执但我还没点"我知道了"的未过期通告；
2. @ 我的消息（我仍能看见该对象）；
3. 我负责/创建的对象在我上次读位之后的新消息。

不新建第二套未读计数：通告看回执表，消息看 `read_cursors`。
"""

from __future__ import annotations

from datetime import UTC

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Announcement,
    AnnouncementAck,
    Event,
    Message,
    MessageMention,
    ReadCursor,
    Task,
    TeamMember,
    User,
    now_utc,
)
from app.services import work
from app.services.announcements import announcement_out
from app.services.messages import message_out

INBOX_LIMIT = 100


def _my_team_ids(db: Session, user_id: int) -> list[int]:
    return list(
        db.scalars(
            select(TeamMember.team_id).where(
                TeamMember.user_id == user_id, TeamMember.status == "active"
            )
        )
    )


def unacked_announcements(db: Session, user: User, now) -> list[dict]:
    team_ids = _my_team_ids(db, user.id)
    if not team_ids:
        return []
    rows = list(
        db.scalars(
            select(Announcement)
            .where(
                Announcement.team_id.in_(team_ids),
                Announcement.deleted_at.is_(None),
                Announcement.requires_ack.is_(True),
                Announcement.id.not_in(
                    select(AnnouncementAck.announcement_id).where(
                        AnnouncementAck.user_id == user.id
                    )
                ),
            )
            .order_by(Announcement.created_at.desc(), Announcement.id.desc())
            .limit(INBOX_LIMIT)
        )
    )
    items = []
    for item in rows:
        expires = item.expires_at
        if expires is not None:
            aware = expires.replace(tzinfo=UTC) if expires.tzinfo is None else expires
            if aware <= now:
                continue
        items.append(
            {
                "kind": "announcement",
                "target_type": "announcement",
                "target_id": item.id,
                "team_id": item.team_id,
                "title": item.title,
                "preview": item.body[:120],
                "created_at": work.timestamp(item.created_at),
                "announcement": announcement_out(
                    db, item, user.id, acked=False, ack_count=0, member_count=0
                ),
            }
        )
    return items


def mention_items(db: Session, user: User) -> list[dict]:
    """@ 我的消息；对象已不可见（退出活动/被移除）时不再出现。"""
    team_ids = _my_team_ids(db, user.id)
    if not team_ids:
        return []
    cursors = {
        (c.target_type, c.target_id): c.last_read_at
        for c in db.scalars(select(ReadCursor).where(ReadCursor.user_id == user.id))
    }
    rows = list(
        db.scalars(
            select(Message)
            .join(MessageMention, MessageMention.message_id == Message.id)
            .where(
                MessageMention.user_id == user.id,
                Message.team_id.in_(team_ids),
                Message.deleted_at.is_(None),
                Message.author_id != user.id,
            )
            .order_by(Message.id.desc())
            .limit(INBOX_LIMIT)
        )
    )
    items = []
    for message in rows:
        if not _still_visible(db, message, user.id):
            continue
        since = cursors.get((message.target_type, message.target_id))
        if since is not None and message.created_at <= since:
            continue
        items.append(
            {
                "kind": "mention",
                "target_type": message.target_type,
                "target_id": message.target_id,
                "team_id": message.team_id,
                "title": _object_title(db, message),
                "preview": message.body[:120],
                "created_at": work.timestamp(message.created_at),
                "message": message_out(db, message, [user.id]),
            }
        )
    return items


def owned_object_items(db: Session, user: User) -> list[dict]:
    """我负责的任务/我组织的活动里，读位之后由别人发出的新消息。"""
    team_ids = _my_team_ids(db, user.id)
    if not team_ids:
        return []
    cursors = {
        (c.target_type, c.target_id): c.last_read_at
        for c in db.scalars(select(ReadCursor).where(ReadCursor.user_id == user.id))
    }
    my_tasks = {
        task.id: task
        for task in db.scalars(
            select(Task).where(
                Task.team_id.in_(team_ids),
                Task.deleted_at.is_(None),
                (Task.assignee_id == user.id) | (Task.created_by == user.id),
            )
        )
    }
    my_events = {
        event.id: event
        for event in db.scalars(
            select(Event).where(
                Event.team_id.in_(team_ids),
                Event.deleted_at.is_(None),
                Event.created_by == user.id,
            )
        )
    }
    rows = list(
        db.scalars(
            select(Message)
            .where(
                Message.team_id.in_(team_ids),
                Message.deleted_at.is_(None),
                Message.author_id != user.id,
            )
            .order_by(Message.id.desc())
            .limit(INBOX_LIMIT * 3)
        )
    )
    # 按对象聚合：每个对象只出现一条（最新一条 + 未读数），避免一次讨论刷满收件箱。
    grouped: dict[tuple[str, int], dict] = {}
    for message in rows:
        if message.target_type == "task" and message.target_id in my_tasks:
            pass
        elif message.target_type == "event" and message.target_id in my_events:
            if not work.can_view(db, my_events[message.target_id], user.id):
                continue
        else:
            continue
        since = cursors.get((message.target_type, message.target_id))
        if since is not None and message.created_at <= since:
            continue
        key = (message.target_type, message.target_id)
        entry = grouped.get(key)
        if entry is None:
            grouped[key] = {
                "kind": "message",
                "target_type": message.target_type,
                "target_id": message.target_id,
                "team_id": message.team_id,
                "title": _object_title(db, message),
                "preview": message.body[:120],
                "created_at": work.timestamp(message.created_at),
                "unread": 1,
                "message": message_out(db, message, []),
            }
        else:
            entry["unread"] += 1
        if len(grouped) >= INBOX_LIMIT:
            break
    return list(grouped.values())


def _still_visible(db: Session, message: Message, user_id: int) -> bool:
    if message.target_type == "event":
        event = db.get(Event, message.target_id)
        return (
            event is not None
            and event.deleted_at is None
            and work.can_view(db, event, user_id)
        )
    if message.target_type == "task":
        task = db.get(Task, message.target_id)
        return task is not None and task.deleted_at is None
    announcement = db.get(Announcement, message.target_id)
    return announcement is not None and announcement.deleted_at is None


def _object_title(db: Session, message: Message) -> str:
    model = {"event": Event, "task": Task, "announcement": Announcement}.get(
        message.target_type
    )
    if model is None:
        return "沟通"
    item = db.get(model, message.target_id)
    return getattr(item, "title", "") or "沟通"


def inbox(db: Session, user: User) -> dict:
    now = now_utc()
    announcements = unacked_announcements(db, user, now)
    mentions = mention_items(db, user)
    owned = owned_object_items(db, user)
    items = sorted(
        [*announcements, *mentions, *owned],
        key=lambda item: item["created_at"] or "",
        reverse=True,
    )
    return {
        "items": items,
        "total": len(items),
        "counts": {
            "announcements": len(announcements),
            "mentions": len(mentions),
            "messages": len(owned),
        },
    }
