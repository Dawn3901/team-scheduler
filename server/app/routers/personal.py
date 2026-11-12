"""CR-002 / CAL-9：个人日历端点，仅当前用户可访问（路径不含 user_id）。"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser
from app.schemas_personal import PersonalEventCreate, PersonalEventPatch
from app.services import personal

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
