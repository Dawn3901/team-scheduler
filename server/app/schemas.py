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


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    avatar_color: str


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

    @field_serializer("joined_at")
    def _serialize_joined_at(self, value: datetime) -> str:
        return _utc_iso(value)


class TeamMemberListOut(BaseModel):
    items: list[TeamMemberOut]
    total: int
