"""user avatar

Revision ID: a71c4f0d2e93
Revises: 6b4e82bbf137
Create Date: 2026-11-16 23:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a71c4f0d2e93"
down_revision: str | None = "6b4e82bbf137"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # 用户头像：只存服务器文件名，不存图片本身；avatar_color 保留为首字母底色兜底。
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("avatar_file", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column("avatar_updated_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("avatar_updated_at")
        batch_op.drop_column("avatar_file")
