"""个人日历（CR-002 / CAL-9）输入模型；业务校验在 services/personal.py。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PersonalEventCreate(BaseModel):
    title: str
    description: str | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    location: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    share_busy: bool = True


class PersonalEventPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = None
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    location: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    share_busy: bool | None = None
