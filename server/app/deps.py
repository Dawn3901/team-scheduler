"""认证依赖：从 Bearer token 解析当前用户。"""

from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import User
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
