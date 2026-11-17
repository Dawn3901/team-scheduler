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

__all__ = ["Base", "PersonalEvent", "Team", "TeamMember", "User", "now_utc"]


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
    # 上传头像只存服务器上的文件名（server/data/avatars/）；为空时前端回退首字母 + avatar_color。
    avatar_file: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
    # CR-016 / NOTE-1：组织者对该成员的备注（或成员的回应附言），仅组织者/Admin 与本人可见。
    note: Mapped[str | None] = mapped_column(Text)


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


class PersonalEvent(Base):
    """用户级个人日历（CR-002 / CAL-9）：跨团队、仅 owner 可见，默认参与团队忙闲。"""

    __tablename__ = "personal_events"
    __table_args__ = (
        CheckConstraint("start_at < end_at", name="ck_personal_events_time"),
        CheckConstraint("all_day IN (0,1)", name="ck_personal_events_all_day"),
        CheckConstraint("share_busy IN (0,1)", name="ck_personal_events_share_busy"),
        Index("ix_personal_events_user_start", "user_id", "start_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    all_day: Mapped[bool] = mapped_column(default=False)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    color: Mapped[str | None] = mapped_column(String, nullable=True)
    share_busy: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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


class Announcement(Base):
    """CR-016 / ANNC-1：团队通告；created_at 即发布时刻。"""

    __tablename__ = "announcements"
    __table_args__ = (
        CheckConstraint("pinned IN (0,1)", name="ck_announcements_pinned"),
        CheckConstraint("requires_ack IN (0,1)", name="ck_announcements_requires_ack"),
        Index("idx_announcements_team_created", "team_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(Text)
    pinned: Mapped[bool] = mapped_column(default=False, server_default=text("0"))
    requires_ack: Mapped[bool] = mapped_column(default=True, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AnnouncementAck(Base):
    """ANNC-2：只有点“我知道了”才写一行，回执以此为唯一依据。"""

    __tablename__ = "announcement_acks"
    announcement_id: Mapped[int] = mapped_column(
        ForeignKey("announcements.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    acked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Message(Base):
    """MSG-1：对象内消息；可见性只继承对象（活动/任务/通告），kind 不影响可见性。"""

    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(
            "target_type IN ('event','task','announcement')", name="ck_messages_target_type"
        ),
        CheckConstraint(
            "kind IN ('comment','note','requirement','blocker',"
            "'unblock','handoff','change_reason')",
            name="ck_messages_kind",
        ),
        Index("idx_messages_target", "team_id", "target_type", "target_id", "id"),
        Index("idx_messages_author", "author_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    target_type: Mapped[str] = mapped_column(String)
    target_id: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String, default="comment")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MessageMention(Base):
    """MSG-2：@ 提及，只允许团队活跃成员。"""

    __tablename__ = "message_mentions"
    __table_args__ = (Index("idx_message_mentions_user", "user_id"),)

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


class ReadCursor(Base):
    """MSG-3：对象级读位，收件箱与未读圆点的唯一来源。"""

    __tablename__ = "read_cursors"
    __table_args__ = (
        CheckConstraint(
            "target_type IN ('event','task','announcement')", name="ck_read_cursors_target_type"
        ),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    target_type: Mapped[str] = mapped_column(String, primary_key=True)
    target_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
