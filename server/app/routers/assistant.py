"""AI 助手入口；每次请求重新验证团队成员身份。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import CurrentUser, MemberContext
from app.services.assistant import ChatRequest, ChatResponse, chat

router = APIRouter(tags=["assistant"])


@router.post("/teams/{team_id}/assistant/chat", response_model=ChatResponse)
def assistant_chat(
    ctx: MemberContext,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    payload: ChatRequest,
) -> ChatResponse:
    return chat(db, ctx, user, payload)
