"""CR-016 / ANNC-1·ANNC-2：团队通告与"点我知道了"回执。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import TeamContext, require_member
from app.errors import ApiError
from app.models import Announcement, AnnouncementAck, User, now_utc
from app.schemas import avatar_url_for
from app.services import work

TITLE_MAX = 100
BODY_MAX = 2000
DEFAULT_LIMIT = 20


def _clean(title: str, body: str) -> tuple[str, str]:
    clean_title = work.text_value(title, TITLE_MAX, required=True)
    clean_body = work.text_value(body, BODY_MAX, required=True)
    return clean_title or "", clean_body or ""


def _expires(value: datetime | None, now: datetime) -> datetime | None:
    if value is None:
        return None
    expires = work.aware_input(value)
    if expires <= now:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "失效时间必须晚于当前时间")
    return expires


def can_manage(ctx: TeamContext, announcement: Announcement, user_id: int) -> bool:
    return announcement.author_id == user_id or ctx.member.role in ("owner", "admin")


def announcement_out(
    db: Session,
    announcement: Announcement,
    viewer_id: int,
    *,
    acked: bool,
    ack_count: int,
    member_count: int,
) -> dict:
    author = db.get(User, announcement.author_id)
    return {
        "id": announcement.id,
        "team_id": announcement.team_id,
        "title": announcement.title,
        "body": announcement.body,
        "pinned": bool(announcement.pinned),
        "requires_ack": bool(announcement.requires_ack),
        "acked": acked,
        "ack_count": ack_count,
        "member_count": member_count,
        "expires_at": work.timestamp(announcement.expires_at),
        "created_at": work.timestamp(announcement.created_at),
        "author": {
            "user_id": announcement.author_id,
            "display_name": author.display_name if author else "已离开的成员",
            "avatar_url": avatar_url_for(
                announcement.author_id,
                author.avatar_file if author else None,
                author.avatar_updated_at if author else None,
            ),
        },
    }


def _ack_state(db: Session, announcements: list[Announcement], viewer_id: int) -> dict[int, dict]:
    ids = [item.id for item in announcements]
    if not ids:
        return {}
    counts = dict(
        db.execute(
            select(AnnouncementAck.announcement_id, func.count())
            .where(AnnouncementAck.announcement_id.in_(ids))
            .group_by(AnnouncementAck.announcement_id)
        ).all()
    )
    mine = set(
        db.scalars(
            select(AnnouncementAck.announcement_id).where(
                AnnouncementAck.announcement_id.in_(ids),
                AnnouncementAck.user_id == viewer_id,
            )
        )
    )
    return {
        item.id: {"acked": item.id in mine, "ack_count": int(counts.get(item.id, 0))}
        for item in announcements
    }


def list_announcements(
    db: Session, ctx: TeamContext, viewer: User, *, limit: int, offset: int
) -> dict:
    now = now_utc()
    visible = (
        Announcement.team_id == ctx.team.id,
        Announcement.deleted_at.is_(None),
    )
    total = db.scalar(select(func.count(Announcement.id)).where(*visible)) or 0
    rows = list(
        db.scalars(
            select(Announcement)
            .where(*visible)
            .order_by(
                Announcement.pinned.desc(),
                Announcement.created_at.desc(),
                Announcement.id.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
    )
    member_count = len(work.active_ids(db, ctx.team.id))
    states = _ack_state(db, rows, viewer.id)
    return {
        "items": [
            {
                **announcement_out(
                    db,
                    item,
                    viewer.id,
                    acked=states[item.id]["acked"],
                    ack_count=states[item.id]["ack_count"],
                    member_count=member_count,
                ),
                "expired": _is_expired(item, now),
                "can_manage": can_manage(ctx, item, viewer.id),
            }
            for item in rows
        ],
        "total": total,
        "unacked_count": sum(
            1
            for item in rows
            if item.requires_ack and not states[item.id]["acked"] and not _is_expired(item, now)
        ),
    }


def _is_expired(announcement: Announcement, now: datetime) -> bool:
    expires = announcement.expires_at
    if expires is None:
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=now.tzinfo)
    return expires <= now


def load_for(db: Session, user: User, announcement_id: int) -> tuple[TeamContext, Announcement]:
    """路径不含 team_id：先按通告找团队，再校验成员身份。"""
    item = db.get(Announcement, announcement_id)
    if item is None or item.deleted_at is not None:
        raise ApiError(404, "NOT_FOUND", "资源不存在")
    return require_member(item.team_id, user, db), item


def get_announcement(db: Session, user: User, announcement_id: int) -> dict:
    ctx, item = load_for(db, user, announcement_id)
    viewer = user
    states = _ack_state(db, [item], viewer.id)
    return {
        **announcement_out(
            db,
            item,
            viewer.id,
            acked=states[item.id]["acked"],
            ack_count=states[item.id]["ack_count"],
            member_count=len(work.active_ids(db, ctx.team.id)),
        ),
        "expired": _is_expired(item, now_utc()),
        "can_manage": can_manage(ctx, item, viewer.id),
    }


def create_announcement(
    db: Session,
    ctx: TeamContext,
    author: User,
    *,
    title: str,
    body: str,
    pinned: bool = False,
    requires_ack: bool = True,
    expires_at: datetime | None = None,
) -> dict:
    if ctx.member.role not in ("owner", "admin"):
        raise ApiError(403, "FORBIDDEN", "只有管理员或所有者可以发布通告")
    clean_title, clean_body = _clean(title, body)
    now = now_utc()
    item = Announcement(
        team_id=ctx.team.id,
        author_id=author.id,
        title=clean_title,
        body=clean_body,
        pinned=bool(pinned),
        requires_ack=bool(requires_ack),
        created_at=now,
        updated_at=now,
        expires_at=_expires(expires_at, now),
    )
    db.add(item)
    db.flush()
    # 发布者自己不需要点“我知道了”：默认记为已确认，回执统计也从这里开始。
    db.add(
        AnnouncementAck(
            announcement_id=item.id, user_id=author.id, acked_at=now
        )
    )
    for user_id in sorted(work.active_ids(db, ctx.team.id) - {author.id}):
        work.notify(
            db,
            user_id,
            ctx.team.id,
            "announcement.published",
            f"新通告：{clean_title}",
            {"team_id": ctx.team.id, "announcement_id": item.id},
            key=work.coalesce_key("announcement.published", item.id, user_id),
        )
    db.commit()
    return get_announcement(db, author, item.id)


def patch_announcement(
    db: Session,
    user: User,
    announcement_id: int,
    *,
    changes: dict,
) -> dict:
    ctx, item = load_for(db, user, announcement_id)
    if not can_manage(ctx, item, user.id):
        raise ApiError(403, "FORBIDDEN", "只有作者或管理员可以修改通告")
    if "title" in changes or "body" in changes:
        clean_title, clean_body = _clean(
            changes.get("title") or item.title, changes.get("body") or item.body
        )
        item.title, item.body = clean_title, clean_body
    if "pinned" in changes and changes["pinned"] is not None:
        item.pinned = bool(changes["pinned"])
    if "requires_ack" in changes and changes["requires_ack"] is not None:
        item.requires_ack = bool(changes["requires_ack"])
    if "expires_at" in changes:
        item.expires_at = (
            None
            if changes["expires_at"] is None
            else _expires(changes["expires_at"], now_utc())
        )
    item.updated_at = now_utc()
    db.commit()
    return get_announcement(db, user, announcement_id)


def delete_announcement(db: Session, user: User, announcement_id: int) -> None:
    ctx, item = load_for(db, user, announcement_id)
    if not can_manage(ctx, item, user.id):
        raise ApiError(403, "FORBIDDEN", "只有作者或管理员可以删除通告")
    item.deleted_at = now_utc()
    db.commit()


def ack(db: Session, user: User, announcement_id: int) -> dict:
    ctx, item = load_for(db, user, announcement_id)
    from app.models import AnnouncementAck as Ack

    existing = db.get(Ack, (announcement_id, user.id))
    if existing is None:
        db.add(Ack(announcement_id=announcement_id, user_id=user.id, acked_at=now_utc()))
        db.commit()
    return get_announcement(db, user, announcement_id)


def receipts(db: Session, user: User, announcement_id: int) -> dict:
    ctx, item = load_for(db, user, announcement_id)
    if not can_manage(ctx, item, user.id):
        raise ApiError(403, "FORBIDDEN", "只有作者或管理员可以查看回执")
    acked_at = dict(
        db.execute(
            select(AnnouncementAck.user_id, AnnouncementAck.acked_at).where(
                AnnouncementAck.announcement_id == announcement_id
            )
        ).all()
    )
    people = []
    for user_id in sorted(work.active_ids(db, ctx.team.id)):
        member = db.get(User, user_id)
        if member is None:
            continue
        people.append(
            {
                "user_id": user_id,
                "display_name": member.display_name,
                "avatar_url": avatar_url_for(
                    user_id, member.avatar_file, member.avatar_updated_at
                ),
                "acked": user_id in acked_at,
                "acked_at": work.timestamp(acked_at.get(user_id)),
            }
        )
    return {
        "items": people,
        "total": len(people),
        "acked_count": sum(1 for person in people if person["acked"]),
    }
