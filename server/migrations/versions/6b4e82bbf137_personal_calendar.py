"""personal calendar

Revision ID: 6b4e82bbf137
Revises: 98643d74e9bb
Create Date: 2026-11-12 12:35:16.954507
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6b4e82bbf137"
down_revision: str | None = '98643d74e9bb'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # CR-002 / CAL-9：用户级个人日历；现有团队表零改动。
    op.create_table('personal_events',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('start_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('end_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('all_day', sa.Boolean(), nullable=False),
    sa.Column('location', sa.String(), nullable=True),
    sa.Column('color', sa.String(), nullable=True),
    sa.Column('share_busy', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint('all_day IN (0,1)', name='ck_personal_events_all_day'),
    sa.CheckConstraint('share_busy IN (0,1)', name='ck_personal_events_share_busy'),
    sa.CheckConstraint('start_at < end_at', name='ck_personal_events_time'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('personal_events', schema=None) as batch_op:
        batch_op.create_index(
            'ix_personal_events_user_start', ['user_id', 'start_at'], unique=False
        )


def downgrade() -> None:
    # 回滚前先备份 sqlite 文件；个人事件只在本表，删除后不影响团队数据。
    with op.batch_alter_table('personal_events', schema=None) as batch_op:
        batch_op.drop_index('ix_personal_events_user_start')

    op.drop_table('personal_events')
