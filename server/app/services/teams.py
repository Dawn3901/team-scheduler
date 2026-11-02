"""团队服务：创建、列表、详情、加入、成员列表（TEAM-1..4, 8）。"""

from __future__ import annotations

import secrets
import string

from sqlalchemy import and_, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ApiError
from app.models import Team, TeamMember, User, now_utc
from app.schemas import (
    TeamCreateRequest,
    TeamJoinRequest,
    TeamListOut,
    TeamMemberListOut,
    TeamMemberOut,
    TeamOut,
)

INVITE_CODE_LENGTH = 8
INVITE_CODE_ALPHABET = string.ascii_uppercase + string.digits
_MAX_INVITE_CODE_ATTEMPTS = 5
TEAM_NAME_MAX = 50
TEAM_DESCRIPTION_MAX = 2000

# TEAM-4：成员列表按角色 owner → admin → member 排序，同角色按加入时间。
_ROLE_SORT = case(
    (TeamMember.role == "owner", 0),
    (TeamMember.role == "admin", 1),
    else_=2,
)


def _generate_invite_code() -> str:
    """BR-10：8 位大写字母 + 数字。"""
    return "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))


def _clean_name(raw: str) -> str:
    name = raw.strip()
    if not name:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "团队名称不能为空")
    if len(name) > TEAM_NAME_MAX:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", f"团队名称不能超过 {TEAM_NAME_MAX} 字")
    return name


def _clean_description(raw: str | None) -> str | None:
    if raw is None:
        return None
    description = raw.strip()
    if len(description) > TEAM_DESCRIPTION_MAX:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", f"团队描述不能超过 {TEAM_DESCRIPTION_MAX} 字")
    return description or None


def _count_active_members(db: Session, team_id: int) -> int:
    return (
        db.scalar(
            select(func.count(TeamMember.id)).where(
                TeamMember.team_id == team_id,
                TeamMember.status == "active",
            )
        )
        or 0
    )


def _to_team_out(db: Session, team: Team, role: str) -> TeamOut:
    return TeamOut(
        id=team.id,
        name=team.name,
        description=team.description,
        invite_code=team.invite_code,
        owner_id=team.owner_id,
        timezone=team.timezone,
        my_role=role,
        member_count=_count_active_members(db, team.id),
    )


def create_team(db: Session, user: User, payload: TeamCreateRequest) -> TeamOut:
    """TEAM-1：创建者成为 Owner，同一事务写入 teams 与 team_members。"""
    if (
        db.scalar(
            select(func.count())
            .select_from(TeamMember)
            .join(Team)
            .where(
                TeamMember.user_id == user.id,
                TeamMember.status == "active",
                Team.deleted_at.is_(None),
            )
        )
        >= 20
    ):
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "每位用户最多加入 20 个团队")
    name = _clean_name(payload.name)
    description = _clean_description(payload.description)
    team_timezone = get_settings().team_timezone

    for _ in range(_MAX_INVITE_CODE_ATTEMPTS):
        code = _generate_invite_code()
        if db.scalar(select(Team.id).where(Team.invite_code == code)) is not None:
            continue

        team = Team(
            name=name,
            description=description,
            invite_code=code,
            owner_id=user.id,
            timezone=team_timezone,
        )
        db.add(team)
        try:
            db.flush()
            db.add(
                TeamMember(
                    team_id=team.id,
                    user_id=user.id,
                    role="owner",
                    status="active",
                    joined_at=now_utc(),
                )
            )
            db.commit()
        except IntegrityError as exc:
            # 并发下邀请码可能被别的请求抢先占用，换一个码重试。
            db.rollback()
            if db.scalar(select(Team.id).where(Team.invite_code == code)) is not None:
                continue
            raise ApiError(409, "CONFLICT", "创建团队冲突，请重试") from exc
        break
    else:
        raise ApiError(409, "CONFLICT", "邀请码生成失败，请重试")

    db.refresh(team)
    return _to_team_out(db, team, "owner")


def list_my_teams(db: Session, user: User, *, limit: int, offset: int) -> TeamListOut:
    """TEAM-8：只返回当前用户仍是活跃成员的团队，已删除团队不出现。"""
    my_membership = and_(
        TeamMember.team_id == Team.id,
        TeamMember.user_id == user.id,
        TeamMember.status == "active",
    )
    total = (
        db.scalar(
            select(func.count())
            .select_from(Team)
            .join(TeamMember, my_membership)
            .where(Team.deleted_at.is_(None))
        )
        or 0
    )

    member_counts = (
        select(TeamMember.team_id, func.count(TeamMember.id).label("member_count"))
        .where(TeamMember.status == "active")
        .group_by(TeamMember.team_id)
        .subquery()
    )
    rows = db.execute(
        select(Team, TeamMember.role, func.coalesce(member_counts.c.member_count, 0))
        .join(TeamMember, my_membership)
        .outerjoin(member_counts, member_counts.c.team_id == Team.id)
        .where(Team.deleted_at.is_(None))
        .order_by(TeamMember.joined_at, Team.id)
        .limit(limit)
        .offset(offset)
    ).all()

    items = [
        TeamOut(
            id=team.id,
            name=team.name,
            description=team.description,
            invite_code=team.invite_code,
            owner_id=team.owner_id,
            timezone=team.timezone,
            my_role=role,
            member_count=member_count,
        )
        for team, role, member_count in rows
    ]
    return TeamListOut(items=items, total=total)


def get_team_detail(db: Session, team: Team, role: str) -> TeamOut:
    """详情由 require_member 保证只有成员能读。"""
    return _to_team_out(db, team, role)


def join_team(db: Session, user: User, payload: TeamJoinRequest) -> TeamOut:
    """TEAM-3：正确邀请码成为 Member；已加入幂等返回，退出后重新加入恢复 active。"""
    code = payload.invite_code.strip().upper()
    team = None
    if code:
        team = db.scalar(select(Team).where(Team.invite_code == code, Team.deleted_at.is_(None)))
    if team is None:
        raise ApiError(409, "INVITE_CODE_INVALID", "邀请码无效或已失效")

    membership = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == team.id,
            TeamMember.user_id == user.id,
        )
    )
    if membership is not None and membership.status == "active":
        return _to_team_out(db, team, membership.role)

    if _count_active_members(db, team.id) >= 50:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "团队人数已达 50 人上限")
    if (
        db.scalar(
            select(func.count())
            .select_from(TeamMember)
            .join(Team)
            .where(
                TeamMember.user_id == user.id,
                TeamMember.status == "active",
                Team.deleted_at.is_(None),
            )
        )
        >= 20
    ):
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "每位用户最多加入 20 个团队")
    if membership is None:
        db.add(
            TeamMember(
                team_id=team.id,
                user_id=user.id,
                role="member",
                status="active",
                joined_at=now_utc(),
            )
        )
    else:
        membership.status = "active"
        membership.joined_at = now_utc()

    try:
        db.commit()
    except IntegrityError:
        # 并发重复加入：另一请求已写入成员行，按幂等处理。
        db.rollback()

    db.refresh(team)
    membership = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == team.id,
            TeamMember.user_id == user.id,
        )
    )
    if membership is None or membership.status != "active":
        raise ApiError(409, "INVITE_CODE_INVALID", "邀请码无效或已失效")
    return _to_team_out(db, team, membership.role)


def list_members(db: Session, team_id: int, *, limit: int, offset: int) -> TeamMemberListOut:
    """TEAM-4：返回昵称、角色、加入时间；按角色排序。"""
    active_members = (
        TeamMember.team_id == team_id,
        TeamMember.status == "active",
    )
    total = db.scalar(select(func.count(TeamMember.id)).where(*active_members)) or 0
    rows = db.execute(
        select(TeamMember, User.display_name)
        .join(User, User.id == TeamMember.user_id)
        .where(*active_members)
        .order_by(_ROLE_SORT, TeamMember.joined_at, TeamMember.id)
        .limit(limit)
        .offset(offset)
    ).all()

    items = [
        TeamMemberOut(
            user_id=member.user_id,
            display_name=display_name,
            role=member.role,
            joined_at=member.joined_at,
        )
        for member, display_name in rows
    ]
    return TeamMemberListOut(items=items, total=total)


def rotate_code(db: Session, team: Team) -> dict:
    for _ in range(_MAX_INVITE_CODE_ATTEMPTS):
        code = _generate_invite_code()
        if db.scalar(select(Team.id).where(Team.invite_code == code)) is None:
            team.invite_code = code
            try:
                db.commit()
                return {"invite_code": code}
            except IntegrityError:
                db.rollback()
    raise ApiError(409, "CONFLICT", "邀请码生成冲突，请重试")


def change_role(db: Session, team_id: int, user_id: int, role: str) -> TeamMemberOut:
    member = _active_member(db, team_id, user_id)
    if member.role == "owner":
        raise ApiError(403, "FORBIDDEN", "不能修改所有者角色")
    member.role = role
    db.commit()
    return TeamMemberOut(
        user_id=user_id,
        display_name=db.get(User, user_id).display_name,
        role=role,
        joined_at=member.joined_at,
    )


def _active_member(db: Session, team_id: int, user_id: int) -> TeamMember:
    member = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
            TeamMember.status == "active",
        )
    )
    if member is None:
        raise ApiError(404, "NOT_FOUND", "成员不存在")
    return member


def remove_member(db: Session, team_id: int, user_id: int) -> None:
    from app.models import Event, EventParticipant, Notification, Task
    from app.services.work import notify, notify_event

    member = _active_member(db, team_id, user_id)
    if member.role == "owner":
        raise ApiError(403, "FORBIDDEN", "所有者须先删除团队")
    tasks = db.scalars(
        select(Task).where(
            Task.team_id == team_id,
            Task.assignee_id == user_id,
            Task.status != "done",
            Task.deleted_at.is_(None),
        )
    ).all()
    admins = db.scalars(
        select(TeamMember.user_id).where(
            TeamMember.team_id == team_id,
            TeamMember.status == "active",
            TeamMember.role.in_(["owner", "admin"]),
            TeamMember.user_id != user_id,
        )
    ).all()
    for task in tasks:
        task.assignee_id = None
        for uid in admins:
            notify(
                db,
                uid,
                team_id,
                "task.assigned",
                "任务待重新指派",
                {"team_id": team_id, "task_id": task.id},
            )
    for event in db.scalars(
        select(Event).where(
            Event.team_id == team_id,
            Event.created_by == user_id,
            Event.visibility == "private",
            Event.status == "confirmed",
            Event.deleted_at.is_(None),
        )
    ):
        event.status = "cancelled"
        notify_event(db, event, "event.cancelled", user_id)
    for p in db.scalars(
        select(EventParticipant)
        .join(Event)
        .where(
            Event.team_id == team_id,
            EventParticipant.user_id == user_id,
            EventParticipant.is_organizer.is_(False),
        )
    ):
        p.response, p.responded_at = "declined", None
    for n in db.scalars(
        select(Notification).where(
            Notification.team_id == team_id,
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    ):
        db.delete(n)
    member.status = "left"
    # 重入团队不能继承旧的管理员身份。
    member.role = "member"
    db.commit()


def delete_team(db: Session, team: Team) -> None:
    from app.models import Notification

    team.deleted_at = now_utc()
    for n in db.scalars(
        select(Notification).where(Notification.team_id == team.id, Notification.read_at.is_(None))
    ):
        db.delete(n)
    db.commit()
