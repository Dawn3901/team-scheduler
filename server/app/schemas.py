"""请求/响应模型：认证与团队。"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

TeamRole = Literal["owner", "admin", "member"]


def _strip_required(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("不能为空")
    return stripped


class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=50)
    password: str = Field(repr=False)
    email: str | None = Field(default=None, max_length=255)

    @field_validator("username", "display_name")
    @classmethod
    def _strip_names(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("email")
    @classmethod
    def _strip_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(repr=False)

    @field_validator("username")
    @classmethod
    def _strip_username(cls, value: str) -> str:
        return _strip_required(value)


class UpdateMeRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=50)
    avatar_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")

    @field_validator("display_name")
    @classmethod
    def _strip_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _strip_required(value)


def avatar_version(updated_at: datetime | None) -> int:
    """头像版本号（毫秒）：SQLite 回读是 naive UTC，统一按 UTC 解释。"""
    if updated_at is not None and updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=UTC)
    return int(updated_at.timestamp() * 1000) if updated_at else 0


def avatar_url_for(user_id: int, filename: str | None, updated_at: datetime | None) -> str | None:
    """AUTH-8：上传头像的访问地址（带版本号，更新后浏览器立即换图）。"""
    if not filename:
        return None
    return f"/api/v1/users/{user_id}/avatar/{avatar_version(updated_at)}"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_color: str
    # 未上传头像时为 null，前端回退首字母 + avatar_color。
    avatar_url: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


def _utc_iso(value: datetime) -> str:
    """SQLite 读回的是 naive datetime，按 UTC 序列化为带 Z 的 ISO 8601。"""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


class TeamCreateRequest(BaseModel):
    name: str
    description: str | None = None


class TeamJoinRequest(BaseModel):
    invite_code: str


class TeamOut(BaseModel):
    id: int
    name: str
    description: str | None
    invite_code: str
    owner_id: int
    timezone: str
    my_role: TeamRole
    member_count: int


class TeamListOut(BaseModel):
    items: list[TeamOut]
    total: int


class TeamMemberOut(BaseModel):
    user_id: int
    display_name: str
    role: TeamRole
    joined_at: datetime
    avatar_url: str | None = None

    @field_serializer("joined_at")
    def _serialize_joined_at(self, value: datetime) -> str:
        return _utc_iso(value)


class TeamMemberListOut(BaseModel):
    items: list[TeamMemberOut]
    total: int
