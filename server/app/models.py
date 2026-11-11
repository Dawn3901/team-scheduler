"""SQLAlchemy ORM 模型。

W1-04 建立 users / teams / team_members；其余业务表在后续周次加入。
时间字段统一由应用层写入 UTC aware datetime。
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

__all__ = ["Base", "Team", "TeamMember", "User", "now_utc"]


def now_utc() -> datetime:
    """返回当前 UTC aware datetime；测试可通过依赖注入替换。"""
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_users_username"),
        UniqueConstraint("email", name="uq_users_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    avatar_color: Mapped[str] = mapped_column(
        String, nullable=False, server_default=text("'#4F46E5'")
    )
    timezone: Mapped[str] = mapped_column(
        String, nullable=False, server_default=text("'Asia/Shanghai'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("invite_code", name="uq_teams_invite_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    invite_code: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    timezone: Mapped[str] = mapped_column(
        String, nullable=False, server_default=text("'Asia/Shanghai'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_members_team_user"),
        CheckConstraint("role IN ('owner','admin','member')", name="ck_team_members_role"),
        CheckConstraint("status IN ('active','left')", name="ck_team_members_status"),
        Index("idx_team_members_user", "user_id", "status"),
        Index(
            "idx_team_one_owner",
            "team_id",
            unique=True,
            sqlite_where=text("role = 'owner' AND status = 'active'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("start_at < end_at", name="ck_events_time"),
        CheckConstraint("visibility IN ('team','private')", name="ck_events_visibility"),
        CheckConstraint("status IN ('confirmed','cancelled')", name="ck_events_status"),
        CheckConstraint("all_day IN (0,1)", name="ck_events_all_day"),
        Index("idx_events_series", "series_id", "original_start"),
        Index("idx_events_team_start", "team_id", "start_at"),
        Index("idx_events_team_end", "team_id", "end_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    series_id: Mapped[int | None] = mapped_column(ForeignKey("event_series.id"))
    original_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(default=False)
    location: Mapped[str | None] = mapped_column(String)
    color: Mapped[str | None] = mapped_column(String)
    visibility: Mapped[str] = mapped_column(String, default="team")
    status: Mapped[str] = mapped_column(String, default="confirmed")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EventParticipant(Base):
    __tablename__ = "event_participants"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_participants_event_user"),
        CheckConstraint(
            "response IN ('pending','accepted','declined','tentative')",
            name="ck_participants_response",
        ),
        CheckConstraint("is_organizer IN (0,1)", name="ck_participants_organizer"),
        Index("idx_participants_user", "user_id"),
        Index(
            "idx_event_one_organizer",
            "event_id",
            unique=True,
            sqlite_where=text("is_organizer = 1"),
        ),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    response: Mapped[str] = mapped_column(String, default="pending")
    needs_confirmation: Mapped[bool] = mapped_column(default=False, server_default=text("0"))
    is_organizer: Mapped[bool] = mapped_column(default=False)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("priority IN ('low','normal','high')", name="ck_tasks_priority"),
        CheckConstraint("status IN ('todo','doing','done')", name="ck_tasks_status"),
        Index("idx_tasks_team_due", "team_id", "due_at"),
        Index("idx_tasks_team_assignee", "team_id", "assignee_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(String, default="normal")
    status: Mapped[str] = mapped_column(String, default="todo")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_notifications_dedupe_key"),
        Index("idx_notifications_user", "user_id", "read_at", "created_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str | None] = mapped_column(Text)
    payload_json: Mapped[str | None] = mapped_column(Text)
    dedupe_key: Mapped[str | None] = mapped_column(String)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class EventSeries(Base):
    __tablename__ = "event_series"
    __table_args__ = (
        CheckConstraint("frequency IN ('weekly','biweekly')", name="ck_series_frequency"),
        CheckConstraint("count >= 1 AND count <= 52", name="ck_series_count"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    frequency: Mapped[str] = mapped_column(String)
    interval_weeks: Mapped[int] = mapped_column(default=1)
    until: Mapped[date | None] = mapped_column(Date)
    count: Mapped[int] = mapped_column()
    timezone: Mapped[str] = mapped_column(String)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        CheckConstraint("task_id != depends_on_id", name="ck_dependency_not_self"),
        Index("idx_dependencies_parent", "depends_on_id"),
    )
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    depends_on_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
