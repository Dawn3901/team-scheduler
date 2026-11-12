"""CR-011：把“我要参加的团队活动”投影到个人日历的只读视图。

不复制数据、不使用通知表：只读取团队活动与 `event_participants`，
按当前用户所在团队实时计算，因此改期/取消/移除邀请会自动反映。
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, EventParticipant, Team, TeamMember, User
from app.services.work import normalized_time, timestamp, utc


def _user_zone(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.timezone or "Asia/Shanghai")
    except Exception:  # noqa: BLE001 - 时区数据异常时回退默认时区
        return ZoneInfo("Asia/Shanghai")


def my_team_events(
    db: Session, user: User, start: datetime, end: datetime
) -> dict[str, list[dict]]:
    """返回 {"attending": [...], "invites": [...]}，字段与团队活动一致且只含可见信息。"""
    member_teams = set(
        db.scalars(
            select(TeamMember.team_id).where(
                TeamMember.user_id == user.id, TeamMember.status == "active"
            )
        )
    )
    if not member_teams:
        return {"attending": [], "invites": []}

    rows = db.execute(
        select(Event, EventParticipant)
        .join(EventParticipant, EventParticipant.event_id == Event.id)
        .where(
            Event.team_id.in_(member_teams),
            Event.status == "confirmed",
            Event.deleted_at.is_(None),
            Event.start_at < end,
            Event.end_at > start,
            EventParticipant.user_id == user.id,
            EventParticipant.response != "declined",
        )
        .order_by(Event.start_at, Event.id)
    ).all()

    team_names = {
        team.id: team.name
        for team in db.scalars(select(Team).where(Team.id.in_({e.team_id for e, _ in rows})))
    }
    zone = _user_zone(user)
    attending: list[dict] = []
    invites: list[dict] = []
    for event, person in rows:
        item = {
            "id": event.id,
            "team_id": event.team_id,
            "team_name": team_names.get(event.team_id, ""),
            "title": event.title,
            "start_at": timestamp(event.start_at),
            "end_at": timestamp(event.end_at),
            "all_day": bool(event.all_day),
            "location": event.location,
            "visibility": event.visibility,
            "my_response": person.response,
            "needs_confirmation": bool(person.needs_confirmation),
            "local_date": utc(event.start_at).astimezone(zone).date().isoformat(),
            "start_key": normalized_time(timestamp(event.start_at)),
            "end_key": normalized_time(timestamp(event.end_at)),
        }
        (invites if person.response == "pending" else attending).append(item)
    return {"attending": attending, "invites": invites}


__all__ = ["my_team_events"]
