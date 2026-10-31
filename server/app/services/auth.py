"""账号服务：注册、登录、资料更新。"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UpdateMeRequest
from app.security import MAX_PASSWORD_BYTES, hash_password, verify_password


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise ApiError(422, "INVALID_PASSWORD", "密码至少 8 位")
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ApiError(422, "INVALID_PASSWORD", f"密码不能超过 {MAX_PASSWORD_BYTES} 字节")


def _username_exists(db: Session, username: str) -> bool:
    return db.scalar(select(User.id).where(User.username == username)) is not None


def _email_exists(db: Session, email: str) -> bool:
    return db.scalar(select(User.id).where(User.email == email)) is not None


def register_user(db: Session, payload: RegisterRequest) -> User:
    _validate_password(payload.password)

    if _username_exists(db, payload.username):
        raise ApiError(409, "USERNAME_TAKEN", "用户名已被使用")
    if payload.email is not None and _email_exists(db, payload.email):
        raise ApiError(409, "CONFLICT", "邮箱已被使用", {"field": "email"})

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # 并发注册时唯一约束仍可能先于上面的预检查触发。
        if _username_exists(db, payload.username):
            raise ApiError(409, "USERNAME_TAKEN", "用户名已被使用") from exc
        if payload.email is not None and _email_exists(db, payload.email):
            raise ApiError(409, "CONFLICT", "邮箱已被使用", {"field": "email"}) from exc
        raise ApiError(409, "CONFLICT", "注册冲突，请重试") from exc

    db.refresh(user)
    return user


def authenticate_user(db: Session, payload: LoginRequest) -> User:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise ApiError(401, "INVALID_CREDENTIALS", "用户名或密码错误")
    return user


def update_user_profile(db: Session, user: User, payload: UpdateMeRequest) -> User:
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.avatar_color is not None:
        user.avatar_color = payload.avatar_color

    db.commit()
    db.refresh(user)
    return user
