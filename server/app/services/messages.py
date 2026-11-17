"""CR-016 / MSG-1·MSG-2：对象内消息。

可见性只继承对象：
- 活动：复用 work.can_view（私密活动非参与者 404）；
- 任务：团队内可见；
- 通告：团队内可见。
`kind` 只影响展示与通知文案，不影响可见性。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import TeamContext, require_member
from app.errors import ApiError
from app.models import (
    Announcement,
    AnnouncementAck,
    Event,
    Message,
    MessageMention,
    Task,
    User,
    now_utc,
)
from app.schemas import avatar_url_for
from app.services import work
from app.services.transactions import serialized_write

TARGETS = ("event", "task", "announcement")
EVENT_KINDS = {"comment", "note", "change_reason", "handoff"}
TASK_KINDS = {"comment", "note", "requirement", "blocker", "unblock", "handoff"}
ANNOUNCEMENT_KINDS = {"comment", "note"}
MESSAGE_MAX = 2000
DEFAULT_LIMIT = 50


def _target(db: Session, ctx: TeamContext, target_type: str, target_id: int, user: User):
    """校验对象存在、属于当前团队、当前用户可见；不可见一律 404。"""
    if target_type == "event":
        event = db.get(Event, target_id)
        if (
            event is None
            or event.deleted_at is not None
            or event.team_id != ctx.team.id
            or not work.can_view(db, event, user.id)
        ):
            raise ApiError(404, "NOT_FOUND", "资源不存在")
        return event
    if target_type == "task":
        task = db.get(Task, target_id)
        if task is None or task.deleted_at is not None or task.team_id != ctx.team.id:
            raise ApiError(404, "NOT_FOUND", "资源不存在")
        return task
    if target_type == "announcement":
        announcement = db.get(Announcement, target_id)
        if (
            announcement is None
            or announcement.deleted_at is not None
            or announcement.team_id != ctx.team.id
        ):
            raise ApiError(404, "NOT_FOUND", "资源不存在")
        return announcement
    raise ApiError(404, "NOT_FOUND", "资源不存在")


def target_context(
    db: Session, user: User, target_type: str, target_id: int
) -> tuple[TeamContext, object]:
    """路径里没有 team_id 时用：先按对象找团队，再校验成员与可见性。"""
    model = {"event": Event, "task": Task, "announcement": Announcement}.get(target_type)
    if model is None:
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    item = db.get(model, target_id)
    if item is None or item.deleted_at is not None:
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    ctx = require_member(item.team_id, user, db)
    if target_type == "event" and not work.can_view(db, item, user.id):
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    return ctx, item


def message_out(db: Session, message: Message, mentions: list[int] | None = None) -> dict:
    author = db.get(User, message.author_id)
    return {
        "id": message.id,
        "target_type": message.target_type,
        "target_id": message.target_id,
        "kind": message.kind,
        "body": message.body,
        "author": {
            "user_id": message.author_id,
            "display_name": author.display_name if author else "已离开的成员",
            "avatar_url": avatar_url_for(
                message.author_id,
                author.avatar_file if author else None,
                author.avatar_updated_at if author else None,
            ),
        },
        "mention_user_ids": mentions or [],
        "created_at": work.timestamp(message.created_at),
    }


def _mentions_for(db: Session, message_ids: list[int]) -> dict[int, list[int]]:
    if not message_ids:
        return {}
    rows = db.execute(
        select(MessageMention.message_id, MessageMention.user_id).where(
            MessageMention.message_id.in_(message_ids)
        )
    ).all()
    grouped: dict[int, list[int]] = {}
    for message_id, user_id in rows:
        grouped.setdefault(message_id, []).append(user_id)
    return grouped


def list_messages(
    db: Session,
    user: User,
    target_type: str,
    target_id: int,
    *,
    before_id: int | None = None,
    limit: int = DEFAULT_LIMIT,
) -> dict:
    """按时间正序返回；`before_id` 用于向上翻更早的消息。"""
    ctx, _ = target_context(db, user, target_type, target_id)
    query = select(Message).where(
        Message.team_id == ctx.team.id,
        Message.target_type == target_type,
        Message.target_id == target_id,
        Message.deleted_at.is_(None),
    )
    if before_id:
        query = query.where(Message.id < before_id)
    rows = list(
        db.scalars(query.order_by(Message.id.desc()).limit(limit + 1))
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()
    mentions = _mentions_for(db, [m.id for m in rows])
    return {
        "items": [message_out(db, m, mentions.get(m.id)) for m in rows],
        "has_more": has_more,
        "next_before_id": rows[0].id if rows and has_more else None,
    }


def _validate_mentions(db: Session, team_id: int, ids: set[int], author_id: int) -> set[int]:
    ids = {int(i) for i in ids} - {author_id}
    if not ids:
        return set()
    if not ids <= work.active_ids(db, team_id):
        raise ApiError(422, "INVALID_MENTION", "只能 @ 当前团队的活跃成员")
    return ids


def _notify_recipients(
    db: Session,
    ctx: TeamContext,
    author: User,
    target_type: str,
    target_id: int,
    title: str,
    body: str,
    mentioned: set[int],
) -> None:
    """@ 优先 + 对象负责人/创建者；作者本人不收自己的消息通知。"""
    payload = {"team_id": ctx.team.id, "target_type": target_type, "target_id": target_id}
    if target_type == "event":
        payload["event_id"] = target_id
    elif target_type == "task":
        payload["task_id"] = target_id
    else:
        payload["announcement_id"] = target_id
    key_target = f"{target_type}:{target_id}"
    watchers: set[int] = set()
    if target_type == "task":
        task = db.get(Task, target_id)
        if task is not None:
            watchers = {task.assignee_id, task.created_by} - {None}
    elif target_type == "event":
        event = db.get(Event, target_id)
        if event is not None:
            watchers = {event.created_by}
    else:
        announcement = db.get(Announcement, target_id)
        if announcement is not None:
            watchers = {announcement.author_id}

    # 通知正文以“谁说了什么”为主：标题放内容摘要，body 放所属对象，避免只看到活动标题。
    preview = " ".join(body.split())
    if len(preview) > 60:
        preview = preview[:60] + "…"
    for user_id in sorted(mentioned | (watchers - mentioned)):
        if user_id == author.id:
            continue
        kind = "message.mentioned" if user_id in mentioned else "message.created"
        work.notify(
            db,
            user_id,
            ctx.team.id,
            kind,
            f"{author.display_name}：{preview}",
            payload,
            key=work.coalesce_key(kind, key_target, user_id),
            body=f"在「{title}」中",
        )
    # 通告下的追问也要让作者收到回执外的提醒（watchers 已覆盖），此处不额外扩散。


@serialized_write
def create_message(
    db: Session,
    user: User,
    target_type: str,
    target_id: int,
    *,
    body: str,
    kind: str = "comment",
    mention_user_ids: list[int] | None = None,
) -> dict:
    ctx, target = target_context(db, user, target_type, target_id)
    if target_type not in TARGETS:
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    allowed = {
        "event": EVENT_KINDS,
        "task": TASK_KINDS,
        "announcement": ANNOUNCEMENT_KINDS,
    }[target_type]
    if kind not in allowed:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "该对象不支持这种消息类型")
    text = work.text_value(body, MESSAGE_MAX, required=True)
    if kind == "blocker" and not text:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "标记受阻时必须说明在等什么")
    mentions = _validate_mentions(db, ctx.team.id, set(mention_user_ids or []), user.id)

    message = Message(
        team_id=ctx.team.id,
        author_id=user.id,
        target_type=target_type,
        target_id=target_id,
        kind=kind,
        body=text,
    )
    db.add(message)
    db.flush()
    for user_id in sorted(mentions):
        db.add(MessageMention(message_id=message.id, user_id=user_id))

    title = getattr(target, "title", "") or "新消息"
    _notify_recipients(db, ctx, user, target_type, target_id, title, text, mentions)
    db.commit()
    return message_out(db, message, sorted(mentions))


def waiting_reason(db: Session, task_id: int) -> str | None:
    """TASK-12：最新一条 blocker 之后没有更晚的 unblock 时，任务处于受阻。"""
    latest = db.scalars(
        select(Message)
        .where(
            Message.target_type == "task",
            Message.target_id == task_id,
            Message.kind.in_(("blocker", "unblock")),
            Message.deleted_at.is_(None),
        )
        .order_by(Message.id.desc())
        .limit(1)
    ).first()
    if latest is None or latest.kind != "blocker":
        return None
    return latest.body


def record_message(
    db: Session,
    ctx: TeamContext,
    user: User,
    target_type: str,
    target_id: int,
    *,
    body: str,
    kind: str,
) -> Message | None:
    """给业务动作（改期原因、交接、完成说明）写一条系统附带消息。

    与 `create_message` 共用可见性校验，但不额外发通知（业务动作本身已通知），
    且失败不阻断主流程：调用方在事务内使用。
    """
    if not body or not body.strip():
        return None
    _target(db, ctx, target_type, target_id, user)
    message = Message(
        team_id=ctx.team.id,
        author_id=user.id,
        target_type=target_type,
        target_id=target_id,
        kind=kind,
        body=work.text_value(body, MESSAGE_MAX, required=True),
    )
    db.add(message)
    db.flush()
    return message


def mark_read(db: Session, user: User, target_type: str, target_id: int) -> None:
    from app.models import ReadCursor

    cursor = db.get(ReadCursor, (user.id, target_type, target_id))
    now = now_utc()
    if cursor is None:
        db.add(
            ReadCursor(
                user_id=user.id,
                target_type=target_type,
                target_id=target_id,
                last_read_at=now,
            )
        )
    else:
        cursor.last_read_at = now
    db.commit()


def unread_counts(
    db: Session, user: User, targets: list[tuple[str, int]]
) -> dict[tuple[str, int], int]:
    """每个对象里"我之外的人发的、晚于读位"的消息数。"""
    from app.models import ReadCursor

    if not targets:
        return {}
    cursors = {
        (c.target_type, c.target_id): c.last_read_at
        for c in db.scalars(select(ReadCursor).where(ReadCursor.user_id == user.id))
    }
    result: dict[tuple[str, int], int] = {}
    for target_type, target_id in targets:
        since: datetime = cursors.get((target_type, target_id)) or datetime.min.replace(
            tzinfo=now_utc().tzinfo
        )
        result[(target_type, target_id)] = (
            db.scalar(
                select(func.count())
                .select_from(Message)
                .where(
                    Message.target_type == target_type,
                    Message.target_id == target_id,
                    Message.deleted_at.is_(None),
                    Message.author_id != user.id,
                    Message.created_at > since,
                )
            )
            or 0
        )
    return result


def acked_ids(db: Session, announcement_id: int) -> set[int]:
    return set(
        db.scalars(
            select(AnnouncementAck.user_id).where(
                AnnouncementAck.announcement_id == announcement_id
            )
        )
    )
