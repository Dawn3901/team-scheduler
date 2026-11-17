"""team messages & announcements

Revision ID: c8f21d4b7a90
Revises: a71c4f0d2e93
Create Date: 2026-11-17 12:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8f21d4b7a90"
down_revision: str | None = "a71c4f0d2e93"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # CR-016：对象内消息 + 团队通告 + 参与者备注。
    op.create_table(
        "announcements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("requires_ack", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("pinned IN (0,1)", name="ck_announcements_pinned"),
        sa.CheckConstraint("requires_ack IN (0,1)", name="ck_announcements_requires_ack"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("announcements", schema=None) as batch_op:
        batch_op.create_index(
            "idx_announcements_team_created", ["team_id", "created_at"], unique=False
        )

    op.create_table(
        "announcement_acks",
        sa.Column("announcement_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("acked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["announcement_id"], ["announcements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("announcement_id", "user_id"),
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "target_type IN ('event','task','announcement')", name="ck_messages_target_type"
        ),
        sa.CheckConstraint(
            "kind IN ('comment','note','requirement','blocker',"
            "'unblock','handoff','change_reason')",
            name="ck_messages_kind",
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.create_index(
            "idx_messages_target",
            ["team_id", "target_type", "target_id", "id"],
            unique=False,
        )
        batch_op.create_index("idx_messages_author", ["author_id"], unique=False)

    op.create_table(
        "message_mentions",
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("message_id", "user_id"),
    )
    with op.batch_alter_table("message_mentions", schema=None) as batch_op:
        batch_op.create_index("idx_message_mentions_user", ["user_id"], unique=False)

    op.create_table(
        "read_cursors",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "target_type IN ('event','task','announcement')", name="ck_read_cursors_target_type"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "target_type", "target_id"),
    )

    with op.batch_alter_table("event_participants", schema=None) as batch_op:
        batch_op.add_column(sa.Column("note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("event_participants", schema=None) as batch_op:
        batch_op.drop_column("note")

    op.drop_table("read_cursors")
    with op.batch_alter_table("message_mentions", schema=None) as batch_op:
        batch_op.drop_index("idx_message_mentions_user")
    op.drop_table("message_mentions")
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_index("idx_messages_author")
        batch_op.drop_index("idx_messages_target")
    op.drop_table("messages")
    op.drop_table("announcement_acks")
    with op.batch_alter_table("announcements", schema=None) as batch_op:
        batch_op.drop_index("idx_announcements_team_created")
    op.drop_table("announcements")
