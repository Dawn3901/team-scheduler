"""CR-012：跨团队“指派给我的开放任务”只读视图（不复制、不新建数据）。

与个人日历无关，但让“我的日程”能直接看到自己的待办；
数据以任务为准，完成后自动消失。
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Task, Team, TeamMember, User
from app.services.work import now_utc, timestamp, utc


def my_tasks(db: Session, user: User, deadline: datetime) -> dict[str, list[dict]]:
    """返回 {overdue: [...], upcoming: [...]}，按截止时间升序。"""
    member_teams = set(
        db.scalars(
            select(TeamMember.team_id).where(
                TeamMember.user_id == user.id, TeamMember.status == "active"
            )
        )
    )
    if not member_teams:
        return {"overdue": [], "upcoming": []}

    rows = db.execute(
        select(Task, Team.name)
        .join(Team, Team.id == Task.team_id)
        .where(
            Task.team_id.in_(member_teams),
            Task.assignee_id == user.id,
            Task.status != "done",
            Task.deleted_at.is_(None),
        )
        .order_by(Task.due_at, Task.id)
    ).all()

    now = now_utc()
    items: list[dict] = []
    for task, team_name in rows:
        due = utc(task.due_at)
        item = {
            "id": task.id,
            "team_id": task.team_id,
            "team_name": team_name,
            "title": task.title,
            "status": task.status,
            "priority": task.priority,
            "due_at": timestamp(task.due_at),
            "overdue": due < now,
        }
        # 未来 30 天的待办进入“即将到期”，逾期单独一组。
        if not item["overdue"] and due > deadline:
            continue
        items.append(item)

    return {
        "overdue": [item for item in items if item["overdue"]],
        "upcoming": [item for item in items if not item["overdue"]],
    }
