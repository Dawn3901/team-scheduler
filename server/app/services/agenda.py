"""CR-013：个人日历的只读聚合议程（个人事件 + 我参加的团队活动 + 我的任务）。

一次查询返回三部分，避免个人日历切视图/翻页时连发三个请求。
全部为实时投影：不改表、不复制数据、不新增写入路径。
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import User
from app.services.my_tasks import my_tasks
from app.services.personal import list_range
from app.services.team_feed import my_team_events
from app.services.work import now_utc, timestamp

TASK_HORIZON_DAYS = 30


def agenda(db: Session, user: User, start: datetime, end: datetime) -> dict:
    """返回 {"from", "to", "events": [...], "tasks": [...]}。

    - events：个人事件（kind=personal）+ 我 accepted/tentative/pending 的团队活动；
      declined、未邀请、被移除邀请不出现在 my_team_events 中。
    - tasks：指派给我、未完成、逾期或 30 天内到期。
    """
    events: list[dict] = []
    for item in list_range(db, user, start, end):
        events.append(
            {
                "id": f"p:{item.id}",
                "source_id": item.id,
                "kind": "personal",
                "title": item.title,
                "start_at": timestamp(item.start_at),
                "end_at": timestamp(item.end_at),
                "all_day": bool(item.all_day),
                "location": item.location,
                "team_id": None,
                "team_name": None,
                "my_response": None,
                "needs_confirmation": False,
                "status": "confirmed",
            }
        )

    feed = my_team_events(db, user, start, end)
    for item in [*feed["attending"], *feed["invites"]]:
        events.append(
            {
                "id": f"e:{item['id']}",
                "source_id": item["id"],
                "kind": "team_event",
                "title": item["title"],
                "start_at": item["start_at"],
                "end_at": item["end_at"],
                "all_day": item["all_day"],
                "location": item["location"],
                "team_id": item["team_id"],
                "team_name": item["team_name"],
                "my_response": item["my_response"],
                "needs_confirmation": item["needs_confirmation"],
                "status": "confirmed",
            }
        )
    events.sort(key=lambda item: (item["start_at"] or "", item["id"]))

    tasks_feed = my_tasks(db, user, now_utc() + timedelta(days=TASK_HORIZON_DAYS))
    tasks = [*tasks_feed["overdue"], *tasks_feed["upcoming"]]
    return {
        "from": timestamp(start),
        "to": timestamp(end),
        "events": events,
        "tasks": tasks,
    }
