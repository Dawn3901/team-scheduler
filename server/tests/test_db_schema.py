"""W1-04 表结构与约束测试。"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import engine
from app.models import Team, TeamMember


def test_business_tables_exist() -> None:
    inspector = inspect(engine)

    assert {"users", "teams", "team_members"} <= set(inspector.get_table_names())

    user_columns = {column["name"]: column for column in inspector.get_columns("users")}
    assert user_columns["username"]["nullable"] is False
    assert user_columns["email"]["nullable"] is True
    assert user_columns["password_hash"]["nullable"] is False

    team_columns = {column["name"]: column for column in inspector.get_columns("teams")}
    assert team_columns["deleted_at"]["nullable"] is True
    assert team_columns["owner_id"]["nullable"] is False


def test_indexes_exist() -> None:
    inspector = inspect(engine)

    index_names = {index["name"] for index in inspector.get_indexes("team_members")}
    assert {"idx_team_members_user", "idx_team_one_owner"} <= index_names


def test_user_and_team_defaults(user_factory, team_factory) -> None:
    user = user_factory()
    team = team_factory(owner=user)

    assert user.avatar_color == "#4F46E5"
    assert user.timezone == "Asia/Shanghai"
    assert user.created_at is not None
    assert team.timezone == "Asia/Shanghai"
    assert team.deleted_at is None


def test_username_must_be_unique(db: Session, user_factory) -> None:
    user_factory(username="alice")

    with pytest.raises(IntegrityError):
        user_factory(username="alice")
    db.rollback()


def test_email_is_optional_but_unique_when_present(db: Session, user_factory) -> None:
    first = user_factory(email=None)
    second = user_factory(email=None)
    assert first.email is None
    assert second.email is None

    user_factory(email="dup@example.com")
    with pytest.raises(IntegrityError):
        user_factory(email="dup@example.com")
    db.rollback()


def test_invite_code_must_be_unique(db: Session, team_factory) -> None:
    team_factory(invite_code="SAME-CODE")

    with pytest.raises(IntegrityError):
        team_factory(invite_code="SAME-CODE")
    db.rollback()


def test_team_owner_must_exist(db: Session) -> None:
    now = datetime.now(UTC)
    db.add(
        Team(
            name="orphan",
            invite_code="ORPHAN",
            owner_id=999_999,
            created_at=now,
            updated_at=now,
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_team_member_pair_must_be_unique(
    db: Session, user_factory, team_factory, team_member_factory
) -> None:
    owner = user_factory()
    team = team_factory(owner=owner)
    member_user = user_factory()
    team_member_factory(team=team, user=member_user)

    with pytest.raises(IntegrityError):
        team_member_factory(team=team, user=member_user)
    db.rollback()


@pytest.mark.parametrize(
    ("role", "status"),
    [("superadmin", "active"), ("member", "inactive")],
)
def test_team_member_role_and_status_are_checked(
    db: Session, user_factory, team_factory, team_member_factory, role: str, status: str
) -> None:
    owner = user_factory()
    team = team_factory(owner=owner)
    member_user = user_factory()

    with pytest.raises(IntegrityError):
        team_member_factory(team=team, user=member_user, role=role, status=status)
    db.rollback()


def test_only_one_active_owner_per_team(
    db: Session, user_factory, team_factory, team_member_factory
) -> None:
    owner = user_factory()
    team = team_factory(owner=owner)
    team_id = team.id
    second = user_factory()

    with pytest.raises(IntegrityError):
        team_member_factory(team=team, user=second, role="owner", status="active")
    db.rollback()

    owner_membership = db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id, TeamMember.user_id == owner.id
        )
    ).scalar_one()
    owner_membership.status = "left"
    db.commit()

    new_owner = team_member_factory(
        team=team, user=second, role="owner", status="active"
    )
    assert new_owner.role == "owner"


def test_deleting_team_cascades_members(
    db: Session, user_factory, team_factory
) -> None:
    owner = user_factory()
    team = team_factory(owner=owner)
    team_id = team.id

    db.delete(team)
    db.commit()

    remaining = db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    ).first()
    assert remaining is None
