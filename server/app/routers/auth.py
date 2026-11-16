"""认证路由：注册、登录、当前用户。"""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser
from app.models import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UpdateMeRequest, UserOut
from app.security import create_access_token
from app.services.auth import authenticate_user, register_user, update_user_profile
from app.services.avatars import avatar_url

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut.model_validate(user).model_copy(update={"avatar_url": avatar_url(user)})


def _auth_response(user_id: int, username: str, user_out: UserOut) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user_id, username),
        user=user_out,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    user = register_user(db, payload)
    return _auth_response(user.id, user.username, _user_out(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
) -> AuthResponse:
    user = authenticate_user(db, payload)
    return _auth_response(user.id, user.username, _user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return _user_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateMeRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    updated = update_user_profile(db, user, payload)
    return _user_out(updated)
