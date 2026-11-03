"""W1-09/W2-07 种子脚本测试（3 用户 + 1 团队 + 5 活动，可重复）。"""

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Event, EventParticipant, Notification, Task, Team, TeamMember, User
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


def _event(db: Session, team_id: int, title: str) -> Event:
    event = db.scalar(
        select(Event).where(
            Event.team_id == team_id,
            Event.title == title,
            Event.deleted_at.is_(None),
        )
    )
    assert event is not None
    return event


def _response(db: Session, event_id: int, username: str) -> str | None:
    user = db.scalar(select(User).where(User.username == username))
    assert user is not None
    person = db.scalar(
        select(EventParticipant).where(
            EventParticipant.event_id == event_id,
            EventParticipant.user_id == user.id,
        )
    )
    return person.response if person is not None else None


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
    assert db.scalar(select(func.count()).select_from(Event)) == 5


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


def test_seed_refuses_to_overwrite_non_demo_account(db: Session, user_factory) -> None:
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


def test_seed_contains_idempotent_example_events_tasks_and_notifications(db: Session) -> None:
    seed_demo_data(db, password=PASSWORD)
    counts = [
        db.scalar(select(func.count()).select_from(model))
        for model in (Event, Task, Notification)
    ]
    assert counts[0] == 5 and counts[1] >= 2 and counts[2] >= 2
    seed_demo_data(db, password=PASSWORD)
    assert counts == [
        db.scalar(select(func.count()).select_from(model))
        for model in (Event, Task, Notification)
    ]


def test_seed_creates_five_demo_events_and_rsvp_distribution(db: Session) -> None:
    result = seed_demo_data(db, password=PASSWORD)

    events = db.scalars(
        select(Event).where(Event.team_id == result.team.id, Event.deleted_at.is_(None))
    ).all()
    by_title = {event.title: event for event in events}
    assert len(events) == 5
    assert set(by_title) == {"团队周会", "需求评审", "冲突活动", "私密活动", "全天活动"}

    weekly = by_title["团队周会"]
    assert _response(db, weekly.id, "chen") == "accepted"
    assert _response(db, weekly.id, "wang") == "pending"
    assert _response(db, by_title["需求评审"].id, "chen") == "declined"
    assert _response(db, by_title["需求评审"].id, "wang") == "accepted"
    assert _response(db, by_title["冲突活动"].id, "chen") == "tentative"
    assert _response(db, by_title["全天活动"].id, "chen") == "accepted"
    assert _response(db, by_title["私密活动"].id, "lin") == "accepted"

    assert by_title["私密活动"].visibility == "private"
    all_day = by_title["全天活动"]
    assert all_day.all_day
    assert all_day.end_at - all_day.start_at == timedelta(days=1)
    conflict = by_title["冲突活动"]
    assert conflict.start_at < weekly.end_at
    assert conflict.end_at > weekly.start_at


def test_seed_upgrades_legacy_private_event_title(db: Session) -> None:
    result = seed_demo_data(db, password=PASSWORD)
    private = _event(db, result.team.id, "私密活动")
    private.title = "个人安排"
    db.commit()

    seed_demo_data(db, password=PASSWORD)

    events = db.scalars(
        select(Event).where(Event.team_id == result.team.id, Event.deleted_at.is_(None))
    ).all()
    titles = {event.title for event in events}
    assert len(events) == 5
    assert "个人安排" not in titles
    assert "私密活动" in titles
