"""W1-09：可重复的演示种子（3 用户 + 1 团队）。

用法：make seed（先 alembic upgrade head，再 python -m app.seed）
约束：
- 密码来自 .env 的 SEED_PASSWORD，不写死在代码里；
- 重复执行不产生重复用户/团队/成员行；
- 演示账号带 @teamsync.local 邮箱标记，遇到同名真实账号时拒绝覆盖。
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import Team, TeamMember, User, now_utc
from app.schemas import TeamCreateRequest
from app.security import hash_password, verify_password
from app.services.teams import create_team

DEMO_EMAIL_DOMAIN = "teamsync.local"
DEMO_TEAM_NAME = "软工大作业"
DEMO_TEAM_DESCRIPTION = "6 周项目"


@dataclass(frozen=True)
class DemoUser:
    username: str
    display_name: str
    avatar_color: str
    role: str

    @property
    def email(self) -> str:
        return f"{self.username}@{DEMO_EMAIL_DOMAIN}"


DEMO_USERS = (
    DemoUser("lin", "林", "#4F46E5", "owner"),
    DemoUser("chen", "陈", "#0EA5E9", "admin"),
    DemoUser("wang", "王", "#16A34A", "member"),
)


@dataclass(frozen=True)
class SeedResult:
    users: tuple[User, ...]
    team: Team
    roles: dict[str, str]

    @property
    def invite_code(self) -> str:
        return self.team.invite_code


def seed_demo_data(db: Session, *, password: str) -> SeedResult:
    if len(password) < 8:
        raise ValueError("SEED_PASSWORD 至少 8 位")

    demo_usernames = [demo.username for demo in DEMO_USERS]
    existing = {
        user.username: user
        for user in db.scalars(select(User).where(User.username.in_(demo_usernames)))
    }

    # 先预检再写库：同名但非演示账号的邮箱标记不同，绝不重置别人的密码。
    for demo in DEMO_USERS:
        user = existing.get(demo.username)
        if user is not None and user.email != demo.email:
            raise RuntimeError(
                f"用户名 {demo.username} 已被非演示账号占用，拒绝覆盖；"
                "请先清理该账号或调整演示账号列表。"
            )

    team_timezone = get_settings().team_timezone
    users: list[User] = []
    for demo in DEMO_USERS:
        user = existing.get(demo.username)
        if user is None:
            user = User(
                username=demo.username,
                email=demo.email,
                display_name=demo.display_name,
                password_hash=hash_password(password),
                avatar_color=demo.avatar_color,
                timezone=team_timezone,
            )
            db.add(user)
            db.flush()
        else:
            user.display_name = demo.display_name
            user.avatar_color = demo.avatar_color
            if not verify_password(password, user.password_hash):
                user.password_hash = hash_password(password)
        users.append(user)

    owner = users[0]
    team = db.scalar(
        select(Team).where(
            Team.name == DEMO_TEAM_NAME,
            Team.owner_id == owner.id,
            Team.deleted_at.is_(None),
        )
    )
    if team is None:
        created = create_team(
            db,
            owner,
            TeamCreateRequest(name=DEMO_TEAM_NAME, description=DEMO_TEAM_DESCRIPTION),
        )
        team = db.get(Team, created.id)
        assert team is not None

    for demo, user in zip(DEMO_USERS, users, strict=True):
        member = db.scalar(
            select(TeamMember).where(
                TeamMember.team_id == team.id,
                TeamMember.user_id == user.id,
            )
        )
        if member is None:
            db.add(
                TeamMember(
                    team_id=team.id,
                    user_id=user.id,
                    role=demo.role,
                    status="active",
                    joined_at=now_utc(),
                )
            )
        else:
            member.role = demo.role
            member.status = "active"

    db.commit()
    db.refresh(team)
    for user in users:
        db.refresh(user)

    return SeedResult(
        users=tuple(users),
        team=team,
        roles={demo.username: demo.role for demo in DEMO_USERS},
    )


def main() -> int:
    settings = get_settings()
    if not settings.seed_password:
        print(
            "缺少 SEED_PASSWORD：请在 .env 中设置（参考 .env.example），再执行 make seed。",
            file=sys.stderr,
        )
        return 1

    with SessionLocal() as db:
        result = seed_demo_data(db, password=settings.seed_password)

    print("TeamSync 演示数据已就绪：")
    for user in result.users:
        print(f"  {user.username:<6} {result.roles[user.username]:<7} {user.display_name}")
    print(f"  团队：{result.team.name}（#{result.team.id}）")
    print(f"  邀请码：{result.invite_code}")
    print("  密码：.env 中的 SEED_PASSWORD")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
