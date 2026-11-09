"""AVAIL-6：忙碌区间合并、工作窗口、必到交集、可选出席评分。"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import TeamContext
from app.errors import ApiError
from app.models import Event, EventParticipant
from app.services.work import active_ids, timestamp, utc, validate_ids, validate_range


def merge_intervals(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def suggestions(
    db: Session,
    ctx: TeamContext,
    start: datetime,
    end: datetime,
    duration: int,
    members: set[int] | None,
    required: set[int] | None,
    work_start: str,
    work_end: str,
    buffer: int,
    weekend: bool,
) -> dict:
    start, end = validate_range(start, end, 31)
    if not 15 <= duration <= 480 or not 0 <= buffer <= 60:
        raise ApiError(422, "UNPROCESSABLE_ENTITY", "时长须为15–480分钟，缓冲须为0–60分钟")
    members = members if members is not None else active_ids(db, ctx.team.id)
    required = required if required is not None else members
    if not members or not required <= members:
        raise ApiError(422, "INVALID_PARTICIPANT", "请选成员，必到成员须在参与成员内")
    validate_ids(db, ctx.team.id, members, "INVALID_PARTICIPANT")
    try:
        opening, closing = time.fromisoformat(work_start), time.fromisoformat(work_end)
        if opening.tzinfo or closing.tzinfo or opening >= closing:
            raise ValueError
    except ValueError:
        raise ApiError(422, "INVALID_TIME_RANGE", "工作时段应为同一天有效的HH:MM区间") from None
    zone = ZoneInfo(ctx.team.timezone)
    pad = timedelta(minutes=buffer)
    rows = db.execute(
        select(Event.start_at, Event.end_at, EventParticipant.user_id)
        .join(EventParticipant, EventParticipant.event_id == Event.id)
        .where(
            Event.team_id == ctx.team.id,
            Event.deleted_at.is_(None),
            Event.status == "confirmed",
            Event.start_at < end + pad,
            Event.end_at > start - pad,
            EventParticipant.response != "declined",
            EventParticipant.user_id.in_(members),
        )
    )
    busy = {uid: [] for uid in members}
    for a, b, uid in rows:
        busy[uid].append((utc(a) - pad, utc(b) + pad))
    busy = {uid: merge_intervals(value) for uid, value in busy.items()}
    day = start.astimezone(zone).date()
    last = end.astimezone(zone).date()
    candidates = []
    optional = members - required
    while day <= last:
        if weekend or day.weekday() < 5:
            window_start = max(
                start + pad, datetime.combine(day, opening, zone).astimezone(start.tzinfo) + pad
            )
            window_end = min(
                end - pad, datetime.combine(day, closing, zone).astimezone(start.tzinfo) - pad
            )
            # UTC网格以当天工作窗口开始为锚，避免宿主时区和DST误差。
            candidate = window_start
            while candidate + timedelta(minutes=duration) <= window_end:
                finish = candidate + timedelta(minutes=duration)
                available = {
                    uid
                    for uid in members
                    if not any(candidate < b and finish > a for a, b in busy[uid])
                }
                if required <= available:
                    score = 0.7 + 0.3 * (
                        len(optional & available) / len(optional) if optional else 1
                    )
                    candidates.append(
                        {
                            "start_at": timestamp(candidate),
                            "end_at": timestamp(finish),
                            "score": round(score, 4),
                            "required_free": True,
                            "available_member_ids": sorted(available),
                            "missing_optional_ids": sorted(optional - available),
                            "reasons": [
                                "必到成员全部空闲",
                                f"{len(available)}/{len(members)} 成员可参加",
                            ],
                        }
                    )
                candidate += timedelta(minutes=15)
        day += timedelta(days=1)
    selected = []
    for item in sorted(candidates, key=lambda c: (-c["score"], c["start_at"])):
        if all(
            item["start_at"] >= old["end_at"] or item["end_at"] <= old["start_at"]
            for old in selected
        ):
            selected.append(item)
        if len(selected) == 3:
            break
    return {
        "from": timestamp(start),
        "to": timestamp(end),
        "duration_minutes": duration,
        "working_hours": {"start": work_start, "end": work_end, "timezone": ctx.team.timezone},
        "suggestions": selected,
    }
