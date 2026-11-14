"""CR-002 / CAL-9：个人日历端点，仅当前用户可访问（路径不含 user_id）。"""

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser
from app.models import now_utc
from app.schemas_personal import PersonalEventCreate, PersonalEventPatch
from app.services import personal
from app.services.agenda import agenda
from app.services.my_tasks import my_tasks
from app.services.team_feed import my_team_events
from app.services.work import validate_range

router = APIRouter(tags=["personal"])

From = Annotated[datetime, Query(alias="from")]
To = Annotated[datetime, Query(alias="to")]
Db = Annotated[Session, Depends(get_db)]


@router.get("/me/calendar")
def calendar(user: CurrentUser, db: Db, start: From, end: To):
    items = personal.list_range(db, user, start, end)
    return {"items": [personal.event_out(e) for e in items], "total": len(items)}


@router.post("/me/events", status_code=201)
def create_event(user: CurrentUser, db: Db, payload: PersonalEventCreate):
    return personal.event_out(personal.create(db, user, payload))


@router.patch("/me/events/{event_id}")
def patch_event(event_id: int, user: CurrentUser, db: Db, payload: PersonalEventPatch):
    event = personal.get_owned(db, event_id, user)
    return personal.event_out(personal.patch(db, event, user, payload))


@router.delete("/me/events/{event_id}", status_code=204)
def delete_event(event_id: int, user: CurrentUser, db: Db):
    personal.delete(db, personal.get_owned(db, event_id, user))
    return Response(status_code=204)


@router.get("/me/team-events")
def team_events(user: CurrentUser, db: Db, start: From, end: To):
    """CR-011：跨团队“我要参加/待回应”的活动，只读视图，不复制数据。"""
    start, end = validate_range(start, end, personal.MAX_RANGE_DAYS)
    return my_team_events(db, user, start, end)


@router.get("/me/tasks")
def my_open_tasks(user: CurrentUser, db: Db):
    """CR-012：跨团队指派给我的逾期与 30 天内任务（只读）。"""
    return my_tasks(db, user, now_utc() + timedelta(days=30))


@router.get("/me/agenda")
def my_agenda(user: CurrentUser, db: Db, start: From, end: To):
    """CR-013：个人日历聚合议程（个人事件 + 我参加的团队活动 + 我的任务）。"""
    start, end = validate_range(start, end, personal.MAX_RANGE_DAYS)
    return agenda(db, user, start, end)
