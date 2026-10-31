"""W1-09 种子脚本测试（3 用户 + 1 团队，可重复）。"""

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Team, TeamMember, User
from app.security import hash_password, verify_password
from app.seed import DEMO_TEAM_NAME, seed_demo_data

PASSWORD = "seed-password-123"


def _members(db: Session, team_id: int) -> dict[str, tuple[str, str]]:
    rows = db.execute(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .where(TeamMember.team_id == team_id)
    ).all()
    return {user.username: (member.role, member.status) for member, user in rows}


def test_seed_creates_three_users_one_team_and_roles(db: Session) -> None:
    result = seed_demo_data(db, password=PASSWORD)

    assert [user.username for user in result.users] == ["lin", "chen", "wang"]
    assert result.roles == {"lin": "owner", "chen": "admin", "wang": "member"}
    assert result.team.name == DEMO_TEAM_NAME
    assert result.invite_code == result.team.invite_code
    assert len(result.invite_code) == 8
    assert result.invite_code.isalnum()
    assert result.invite_code == result.invite_code.upper()

    assert db.scalar(select(func.count()).select_from(User)) == 3
    assert db.scalar(select(func.count()).select_from(Team)) == 1
    assert db.scalar(select(func.count()).select_from(TeamMember)) == 3

    lin = db.scalar(select(User).where(User.username == "lin"))
    assert lin is not None
    assert lin.email == "lin@teamsync.local"
    assert lin.display_name == "林"
    assert verify_password(PASSWORD, lin.password_hash)

    assert _members(db, result.team.id) == {
        "lin": ("owner", "active"),
        "chen": ("admin", "active"),
        "wang": ("member", "active"),
    }
    assert result.team.owner_id == lin.id


def test_seed_is_idempotent(db: Session) -> None:
    first = seed_demo_data(db, password=PASSWORD)
    second = seed_demo_data(db, password=PASSWORD)

    assert second.team.id == first.team.id
    assert second.invite_code == first.invite_code
    assert db.scalar(select(func.count()).select_from(User)) == 3
    assert db.scalar(select(func.count()).select_from(Team)) == 1
    assert db.scalar(select(func.count()).select_from(TeamMember)) == 3


def test_seed_resets_demo_account_password_and_profile(db: Session) -> None:
    seed_demo_data(db, password=PASSWORD)
    lin = db.scalar(select(User).where(User.username == "lin"))
    assert lin is not None
    lin.password_hash = hash_password("old-demo-password")
    lin.display_name = "旧名字"
    db.commit()

    seed_demo_data(db, password=PASSWORD)
    db.refresh(lin)

    assert lin.display_name == "林"
    assert verify_password(PASSWORD, lin.password_hash)


def test_seed_refuses_to_overwrite_non_demo_account(
    db: Session, user_factory
) -> None:
    user_factory(username="lin", email="real-user@example.com")

    with pytest.raises(RuntimeError, match="非演示账号"):
        seed_demo_data(db, password=PASSWORD)

    assert db.scalar(select(func.count()).select_from(User)) == 1
    assert db.scalar(select(func.count()).select_from(Team)) == 0


def test_seed_rejects_short_password(db: Session) -> None:
    with pytest.raises(ValueError, match="至少 8 位"):
        seed_demo_data(db, password="short")

    assert db.scalar(select(func.count()).select_from(User)) == 0
    assert db.scalar(select(func.count()).select_from(Team)) == 0
