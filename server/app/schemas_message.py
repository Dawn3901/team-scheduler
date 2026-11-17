"""CR-016：沟通相关输入模型；业务校验在 services/messages|announcements。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MessageKind = Literal[
    "comment", "note", "requirement", "blocker", "unblock", "handoff", "change_reason"
]
TargetType = Literal["event", "task", "announcement"]


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    kind: MessageKind = "comment"
    mention_user_ids: list[int] = Field(default_factory=list)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=2000)
    pinned: bool = False
    requires_ack: bool = True
    expires_at: datetime | None = None


class AnnouncementPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    body: str | None = Field(default=None, min_length=1, max_length=2000)
    pinned: bool | None = None
    requires_ack: bool | None = None
    expires_at: datetime | None = None


class ReadMark(BaseModel):
    target_type: TargetType
    target_id: int


class ParticipantNote(BaseModel):
    """NOTE-1：组织者给某个参与者的备注；空串表示清空。"""

    note: str | None = Field(default=None, max_length=500)
