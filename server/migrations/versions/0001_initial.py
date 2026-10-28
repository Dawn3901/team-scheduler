"""W1-02 空基线。

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-27
"""

from collections.abc import Sequence

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
