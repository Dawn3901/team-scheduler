"""认证依赖：从 Bearer token 解析当前用户；团队依赖：校验成员身份。"""

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import Team, TeamMember, User
from app.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)
UNAUTHORIZED_HEADERS = {"WWW-Authenticate": "Bearer"}


def _unauthorized() -> ApiError:
    return ApiError(
        401,
        "UNAUTHORIZED",
        "请先登录",
        headers=UNAUTHORIZED_HEADERS,
    )


def _not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "资源不存在")


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise _unauthorized()

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError:
        raise _unauthorized() from None

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise _unauthorized() from None

    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class TeamContext:
    team: Team
    member: TeamMember


def require_member(
    team_id: int,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> TeamContext:
    """校验当前用户是团队活跃成员；团队不存在/已删除/非成员统一 404。"""
    team = db.get(Team, team_id)
    if team is None or team.deleted_at is not None:
        raise _not_found()

    member = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user.id,
            TeamMember.status == "active",
        )
    )
    if member is None:
        raise _not_found()
    return TeamContext(team=team, member=member)


MemberContext = Annotated[TeamContext, Depends(require_member)]
