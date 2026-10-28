"""SQLAlchemy ORM 模型。

W1-02 只建立 ``Base``；users / teams / team_members 表在 W1-04 迁移中加入。
"""

from app.db import Base

__all__ = ["Base"]
