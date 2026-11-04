"""W1-09/W2-07：可重复的演示种子（3 用户 + 1 团队 + 5 活动 + 2 任务）。

用法：make seed（幂等补齐）；make seed-reset（先删演示业务数据再重建）
约束：
- 密码来自 .env 的 SEED_PASSWORD，不写死在代码里；
- 重复执行不产生重复用户/团队/成员/演示活动；
- 演示活动按标题补齐；RSVP 每次归一到演示分布，不覆盖活动时间/标题；
- --reset 只删除演示团队的活动/任务/通知，不删除账号、团队和邀请码；
- 演示账号带 @teamsync.local 邮箱标记，遇到同名真实账号时拒绝覆盖。
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.deps import TeamContext, require_member
from app.models import (
    Event,
    EventParticipant,
    Notification,
    Task,
    Team,
    TeamMember,
    User,
    now_utc,
)
from app.schemas import TeamCreateRequest
from app.schemas_work import EventCreate, TaskCreate
from app.security import hash_password, verify_password
from app.services.teams import create_team
from app.services.work import create_event, create_task

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
class DemoEvent:
    """W2-07 演示活动；时间为团队时区，day_offset 从明天起算。"""

    title: str
    day_offset: int
    start_hour: int
    start_minute: int
    duration_minutes: int | None
    description: str
    location: str
    participant_usernames: tuple[str, ...]
    responses: tuple[tuple[str, str], ...]
    visibility: str = "team"
    ignore_conflicts: bool = False


DEMO_EVENTS = (
    DemoEvent(
        "团队周会",
        1,
        10,
        0,
        60,
        "讨论分工与进度",
        "会议室 A",
        ("chen", "wang"),
        (("chen", "accepted"), ("wang", "pending")),
    ),
    DemoEvent(
        "需求评审",
        1,
        14,
        0,
        60,
        "评审需求与验收标准",
        "线上",
        ("chen", "wang"),
        (("chen", "declined"), ("wang", "accepted")),
    ),
    DemoEvent(
        "冲突活动",
        1,
        10,
        30,
        60,
        "与团队周会重叠，用于冲突演示",
        "会议室 B",
        ("chen",),
        (("chen", "tentative"),),
        ignore_conflicts=True,
    ),
    DemoEvent(
        "私密活动",
        1,
        16,
        0,
        60,
        "个人安排，队友只看到忙碌",
        "线上",
        (),
        (),
        visibility="private",
    ),
    DemoEvent(
        "全天活动",
        2,
        0,
        0,
        None,
        "团队全天工作坊",
        "会议室 A",
        ("chen", "wang"),
        (("chen", "accepted"), ("wang", "accepted")),
    ),
)


@dataclass(frozen=True)
class SeedResult:
    users: tuple[User, ...]
    team: Team
    roles: dict[str, str]

    @property
    def invite_code(self) -> str:
        return self.team.invite_code


def _event_window(
    spec: DemoEvent, base_day: date, zone: ZoneInfo
) -> tuple[datetime, datetime]:
    """把 DemoEvent 的相对日期换算成 UTC 起止时间。"""
    day = base_day + timedelta(days=spec.day_offset)
    if spec.duration_minutes is None:
        start_local = datetime.combine(day, time(0, 0), tzinfo=zone)
        end_local = datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=zone)
    else:
        start_local = datetime.combine(
            day, time(spec.start_hour, spec.start_minute), tzinfo=zone
        )
        end_local = start_local + timedelta(minutes=spec.duration_minutes)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _ensure_demo_events(
    db: Session,
    ctx: TeamContext,
    owner: User,
    users_by_username: dict[str, User],
    zone: ZoneInfo,
) -> None:
    """按标题补齐 5 个演示活动，并把 RSVP 归一到演示分布。

    只补缺失的活动/参与者，不改已有活动的时间、地点；旧种子的“个人安排”会升级为“私密活动”。
    重复执行不会新增行。
    """
    base_day = now_utc().astimezone(zone).date() + timedelta(days=1)

    # W1 旧种子把私密示例叫“个人安排”；升级到 W2-07 的“私密活动”，避免多出第 6 个活动。
    legacy = db.scalar(
        select(Event).where(
            Event.team_id == ctx.team.id,
            Event.title == "个人安排",
            Event.deleted_at.is_(None),
        )
    )
    if legacy is not None:
        has_private = db.scalar(
            select(Event.id).where(
                Event.team_id == ctx.team.id,
                Event.title == "私密活动",
                Event.deleted_at.is_(None),
            )
        )
        if has_private is None:
            legacy.title = "私密活动"
            db.commit()

    for spec in DEMO_EVENTS:
        event = db.scalar(
            select(Event).where(
                Event.team_id == ctx.team.id,
                Event.title == spec.title,
                Event.deleted_at.is_(None),
            )
        )
        participant_ids = [
            users_by_username[username].id for username in spec.participant_usernames
        ]
        if event is None:
            start, end = _event_window(spec, base_day, zone)
            created = create_event(
                db,
                ctx,
                owner,
                EventCreate(
                    title=spec.title,
                    description=spec.description,
                    start_at=start,
                    end_at=end,
                    all_day=spec.duration_minutes is None,
                    location=spec.location,
                    visibility=spec.visibility,
                    participant_ids=participant_ids,
                    ignore_conflicts=spec.ignore_conflicts,
                ),
            )
            event = db.get(Event, created["id"])
            assert event is not None
        else:
            for user_id in participant_ids:
                person = db.scalar(
                    select(EventParticipant).where(
                        EventParticipant.event_id == event.id,
                        EventParticipant.user_id == user_id,
                    )
                )
                if person is None:
                    db.add(
                        EventParticipant(
                            event_id=event.id,
                            user_id=user_id,
                            response="pending",
                            is_organizer=False,
                            invited_at=now_utc(),
                        )
                    )
            db.commit()

        for username, response in spec.responses:
            person = db.scalar(
                select(EventParticipant).where(
                    EventParticipant.event_id == event.id,
                    EventParticipant.user_id == users_by_username[username].id,
                )
            )
            if person is None or person.is_organizer or person.response == response:
                continue
            person.response = response
            person.responded_at = now_utc() if response != "pending" else None
        db.commit()


def _reset_demo_business_data(db: Session, team_id: int) -> None:
    """--reset 只清演示团队的演示业务数据，保留账号、团队和邀请码。"""
    event_ids = select(Event.id).where(Event.team_id == team_id)
    db.execute(delete(EventParticipant).where(EventParticipant.event_id.in_(event_ids)))
    db.execute(delete(Event).where(Event.team_id == team_id))
    db.execute(delete(Task).where(Task.team_id == team_id))
    db.execute(delete(Notification).where(Notification.team_id == team_id))
    db.commit()


def seed_demo_data(db: Session, *, password: str, reset: bool = False) -> SeedResult:
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

    # W2-07：按标题补齐 5 个演示活动，并归一到演示用 RSVP 分布。
    ctx = require_member(team.id, owner, db)
    if reset:
        _reset_demo_business_data(db, team.id)
    users_by_username = {user.username: user for user in users}
    _ensure_demo_events(db, ctx, owner, users_by_username, ZoneInfo(team_timezone))
    if db.scalar(select(Task.id).where(Task.team_id == team.id).limit(1)) is None:
        create_task(
            db,
            ctx,
            owner,
            TaskCreate(
                title="完成概要设计",
                assignee_id=users[1].id,
                due_at=now_utc() + timedelta(days=2),
                priority="high",
            ),
        )
        create_task(
            db,
            ctx,
            owner,
            TaskCreate(
                title="补充回归测试",
                assignee_id=users[2].id,
                due_at=now_utc() - timedelta(days=1),
            ),
        )

    return SeedResult(
        users=tuple(users),
        team=team,
        roles={demo.username: demo.role for demo in DEMO_USERS},
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TeamSync 演示种子")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="先删除演示团队的活动/任务/通知，再重建 5 个演示活动",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    if not settings.seed_password:
        print(
            "缺少 SEED_PASSWORD：请在 .env 中设置（参考 .env.example），再执行 make seed。",
            file=sys.stderr,
        )
        return 1

    with SessionLocal() as db:
        result = seed_demo_data(
            db, password=settings.seed_password, reset=args.reset
        )

    print("TeamSync 演示数据已就绪：")
    for user in result.users:
        print(f"  {user.username:<6} {result.roles[user.username]:<7} {user.display_name}")
    print(f"  团队：{result.team.name}（#{result.team.id}）")
    print(f"  邀请码：{result.invite_code}")
    print("  密码：.env 中的 SEED_PASSWORD")
    if args.reset:
        print("  模式：已重置演示业务数据（活动/任务/通知）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
