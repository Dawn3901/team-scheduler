"""团队路由：列表、创建、加入、详情、成员列表（TEAM-1..4, 8）。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import AdminContext, CurrentUser, MemberContext, OwnerContext
from app.schemas import (
    TeamCreateRequest,
    TeamJoinRequest,
    TeamListOut,
    TeamMemberListOut,
    TeamMemberOut,
    TeamOut,
)
from app.schemas_work import RoleRequest
from app.services import teams as team_service

router = APIRouter(prefix="/teams", tags=["teams"])

LimitQuery = Annotated[int, Query(ge=1, le=100)]
OffsetQuery = Annotated[int, Query(ge=0)]


@router.get("", response_model=TeamListOut)
def list_teams(
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    limit: LimitQuery = 20,
    offset: OffsetQuery = 0,
) -> TeamListOut:
    return team_service.list_my_teams(db, user, limit=limit, offset=offset)


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreateRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> TeamOut:
    return team_service.create_team(db, user, payload)


# 静态路径必须声明在 /{team_id} 之前，避免 "join" 被当成 team_id。
@router.post("/join", response_model=TeamOut)
def join_team(
    payload: TeamJoinRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> TeamOut:
    return team_service.join_team(db, user, payload)


@router.get("/{team_id}", response_model=TeamOut)
def get_team(ctx: MemberContext, db: Annotated[Session, Depends(get_db)]) -> TeamOut:
    return team_service.get_team_detail(db, ctx.team, ctx.member.role)


@router.get("/{team_id}/members", response_model=TeamMemberListOut)
def list_members(
    ctx: MemberContext,
    db: Annotated[Session, Depends(get_db)],
    limit: LimitQuery = 20,
    offset: OffsetQuery = 0,
) -> TeamMemberListOut:
    return team_service.list_members(db, ctx.team.id, limit=limit, offset=offset)


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberOut)
def change_role(ctx: OwnerContext, user_id: int, payload: RoleRequest,
                db: Annotated[Session, Depends(get_db)]) -> TeamMemberOut:
    return team_service.change_role(db, ctx.team.id, user_id, payload.role)


@router.delete("/{team_id}/members/{user_id}", status_code=204)
def remove_member(ctx: AdminContext, user_id: int,
                  db: Annotated[Session, Depends(get_db)]) -> Response:
    team_service.remove_member(db, ctx.team.id, user_id)
    return Response(status_code=204)


@router.post("/{team_id}/leave", status_code=204)
def leave_team(ctx: MemberContext, user: CurrentUser,
               db: Annotated[Session, Depends(get_db)]) -> Response:
    team_service.remove_member(db, ctx.team.id, user.id)
    return Response(status_code=204)


@router.post("/{team_id}/invite-code/rotate")
def rotate_code(ctx: AdminContext, db: Annotated[Session, Depends(get_db)]) -> dict:
    return team_service.rotate_code(db, ctx.team)


@router.delete("/{team_id}", status_code=204)
def delete_team(ctx: OwnerContext, db: Annotated[Session, Depends(get_db)]) -> Response:
    team_service.delete_team(db, ctx.team)
    return Response(status_code=204)
