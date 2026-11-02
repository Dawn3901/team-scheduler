"""P0 活动、任务输入；业务校验在 service 中执行。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class EventCreate(BaseModel):
    title: str
    start_at: datetime
    end_at: datetime
    description: str | None = None
    all_day: bool = False
    location: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    visibility: Literal["team", "private"] = "team"
    participant_ids: list[int] = Field(default_factory=list)
    ignore_conflicts: bool = False


class EventPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    description: str | None = None
    all_day: bool | None = None
    location: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    visibility: Literal["team", "private"] | None = None
    status: Literal["cancelled"] | None = None
    ignore_conflicts: bool = False


class InviteRequest(BaseModel):
    user_ids: list[int]


class RsvpRequest(BaseModel):
    response: Literal["accepted", "declined", "tentative"]


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    assignee_id: int
    due_at: datetime
    priority: Literal["low", "normal", "high"] = "normal"


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    assignee_id: int | None = None
    due_at: datetime | None = None
    priority: Literal["low", "normal", "high"] | None = None
    status: Literal["todo", "doing", "done"] | None = None


class RoleRequest(BaseModel):
    role: Literal["admin", "member"]
