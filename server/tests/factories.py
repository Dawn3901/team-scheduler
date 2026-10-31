"""测试工厂：只负责造合法数据，不承载业务规则。"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import Team, TeamMember, User


def _token() -> str:
    return uuid4().hex[:8]


def _now() -> datetime:
    return datetime.now(UTC)


def create_user(
    db: Session,
    *,
    username: str | None = None,
    email: str | None = None,
    password_hash: str = "not-a-real-password-hash",
    display_name: str | None = None,
    avatar_color: str = "#4F46E5",
    timezone: str = "Asia/Shanghai",
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> User:
    suffix = _token()
    now = _now()
    user = User(
        username=username or f"user_{suffix}",
        email=email,
        password_hash=password_hash,
        display_name=display_name or f"User {suffix}",
        avatar_color=avatar_color,
        timezone=timezone,
        created_at=created_at or now,
        updated_at=updated_at or now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_team(
    db: Session,
    *,
    owner: User | None = None,
    name: str | None = None,
    description: str | None = None,
    invite_code: str | None = None,
    timezone: str = "Asia/Shanghai",
) -> Team:
    owner = owner or create_user(db)
    suffix = _token()
    now = _now()
    team = Team(
        name=name or f"Team {suffix}",
        description=description,
        invite_code=invite_code or f"invite_{suffix}",
        owner_id=owner.id,
        timezone=timezone,
        created_at=now,
        updated_at=now,
    )
    db.add(team)
    db.flush()

    # 设计约定：建团队必须在同一事务写 Owner 的 team_members 行。
    db.add(
        TeamMember(
            team_id=team.id,
            user_id=owner.id,
            role="owner",
            status="active",
            joined_at=now,
        )
    )
    db.commit()
    db.refresh(team)
    return team


def create_team_member(
    db: Session,
    *,
    team: Team,
    user: User,
    role: str = "member",
    status: str = "active",
    joined_at: datetime | None = None,
) -> TeamMember:
    member = TeamMember(
        team_id=team.id,
        user_id=user.id,
        role=role,
        status=status,
        joined_at=joined_at or _now(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member
