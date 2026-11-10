"""NOTI-5..7：可注入时钟的每分钟扫描；单进程启动，唯一键保障去重。"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, Task, Team, now_utc
from app.services.work import notify, participants, timestamp, utc


def scan_reminders(db: Session, now: datetime | None = None) -> None:
    now = utc(now or now_utc())
    for team in db.scalars(select(Team).where(Team.deleted_at.is_(None))):
        local = now.astimezone(ZoneInfo(team.timezone))
        events = db.scalars(
            select(Event).where(
                Event.team_id == team.id,
                Event.status == "confirmed",
                Event.deleted_at.is_(None),
                Event.start_at > now,
                Event.start_at <= now + timedelta(minutes=15),
            )
        )
        for event in events:
            # 不对补录的过去活动生成提醒。
            if utc(event.created_at) >= utc(event.start_at):
                continue
            for p in participants(db, event.id):
                if p.response != "declined":
                    notify(
                        db,
                        p.user_id,
                        team.id,
                        "event.reminder",
                        event.title,
                        {"team_id": team.id, "event_id": event.id},
                        f"event.reminder:{p.user_id}:{event.id}:15m:{timestamp(event.start_at)}",
                    )
        tasks = db.scalars(
            select(Task).where(
                Task.team_id == team.id,
                Task.status != "done",
                Task.deleted_at.is_(None),
                Task.assignee_id.is_not(None),
            )
        )
        for task in tasks:
            due = utc(task.due_at)
            if now < due <= now + timedelta(hours=1):
                kind, bucket = "task.due_soon", "1h"
            elif due < now and local.hour >= 9:
                kind, bucket = "task.overdue", local.date().isoformat()
            else:
                continue
            notify(
                db,
                task.assignee_id,
                team.id,
                kind,
                task.title,
                {"team_id": team.id, "task_id": task.id},
                f"{kind}:{task.assignee_id}:{task.id}:{bucket}",
            )
    db.commit()
