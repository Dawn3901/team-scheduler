"""固定随机种子生成大规模背景，保留可手工演示的确定性场景。"""

import csv
import json
import os
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter
from zoneinfo import ZoneInfo

from alembic import command
from alembic.config import Config
from app.db import SessionLocal
from app.deps import require_member
from app.models import (
    Event,
    EventParticipant,
    Task,
    TaskDependency,
    Team,
    TeamMember,
    User,
)
from app.schemas_work import EventCreate
from app.security import hash_password
from app.services.recurrence import create as create_series
from sqlalchemy import func, select

DEPARTMENTS = [
    "研发",
    "产品",
    "设计",
    "测试",
    "运维",
    "市场",
    "销售",
    "客服",
    "财务",
    "人事",
]
PASSWORD = "CompanyDemo2026!"  # 公开的本地虚构演示密码，不用于任何真实账号。


def seed(directory: Path):
    began = perf_counter()
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "server/alembic.ini"))
    config.set_main_option("script_location", str(root / "server/migrations"))
    command.upgrade(config, "head")
    rng = random.Random(20261109)
    zone = ZoneInfo("Asia/Shanghai")
    today = datetime.now(zone).replace(hour=9, minute=0, second=0, microsecond=0)
    base = today + timedelta(days=7 - today.weekday())
    password = os.environ.get("COMPANY_DEMO_PASSWORD", PASSWORD)
    hashed = hash_password(password)
    with SessionLocal() as db:
        users = []
        for i in range(500):
            department = DEPARTMENTS[i // 50]
            users.append(
                User(
                    username=f"corp{i + 1:04}",
                    display_name=f"{department}·员工{i + 1:04}",
                    email=f"corp{i + 1:04}@company.example",
                    password_hash=hashed,
                    avatar_color=["#4F46E5", "#16A34A", "#0EA5E9"][i % 3],
                )
            )
        db.add_all(users)
        db.flush()
        company = Team(
            name="星河科技·500人全员协作",
            description="虚构公司大数据测试，不代表生产容量承诺",
            owner_id=users[0].id,
            invite_code="CORP0500",
            timezone="Asia/Shanghai",
        )
        db.add(company)
        db.flush()
        db.add_all(
            [
                TeamMember(
                    team_id=company.id,
                    user_id=u.id,
                    role="owner" if i == 0 else ("admin" if i % 50 == 0 else "member"),
                    status="active",
                )
                for i, u in enumerate(users)
            ]
        )
        for dep, name in enumerate(DEPARTMENTS):
            group = users[dep * 50 : (dep + 1) * 50]
            team = Team(
                name=f"星河科技·{name}部",
                owner_id=group[0].id,
                invite_code=f"DEPT{dep:04}",
                timezone="Asia/Shanghai",
            )
            db.add(team)
            db.flush()
            db.add_all(
                [
                    TeamMember(
                        team_id=team.id,
                        user_id=u.id,
                        role="owner" if j == 0 else "member",
                        status="active",
                    )
                    for j, u in enumerate(group)
                ]
            )
        events, people = [], []
        for i in range(9800):
            group = rng.sample(users, 8)
            start = (
                base
                + timedelta(
                    days=rng.randrange(60),
                    hours=rng.randrange(2, 8),
                    minutes=rng.choice([0, 30]),
                )
            ).astimezone(UTC)
            eid = i + 1
            private = i % 7 == 0
            events.append(
                {
                    "id": eid,
                    "team_id": company.id,
                    "title": f"{DEPARTMENTS[i % 10]}·项目协调会{i + 1:05}",
                    "description": "固定随机种子生成的模拟工作安排",
                    "start_at": start,
                    "end_at": start + timedelta(minutes=rng.choice([30, 60])),
                    "location": f"{i % 12 + 1}号会议室",
                    "visibility": "private" if private else "team",
                    "status": "confirmed",
                    "created_by": group[0].id,
                    "all_day": False,
                }
            )
            for j, u in enumerate(group):
                people.append(
                    {
                        "event_id": eid,
                        "user_id": u.id,
                        "is_organizer": j == 0,
                        "response": "accepted"
                        if j == 0
                        else rng.choice(
                            ["accepted", "tentative", "pending", "declined"]
                        ),
                    }
                )
        db.execute(Event.__table__.insert(), events)
        db.execute(EventParticipant.__table__.insert(), people)
        optional_busy = Event(
            team_id=company.id,
            title="私密·业务收购讨论（脱敏测试）",
            start_at=base.astimezone(UTC),
            end_at=(base + timedelta(hours=1)).astimezone(UTC),
            visibility="private",
            created_by=users[20].id,
        )
        db.add(optional_busy)
        db.flush()
        db.add_all(
            [
                EventParticipant(
                    event_id=optional_busy.id,
                    user_id=u.id,
                    response="accepted",
                    is_organizer=j == 0,
                )
                for j, u in enumerate(users[20:120])
            ]
        )
        all_hands = Event(
            team_id=company.id,
            title="全员战略会·改期重新确认演示",
            start_at=(base + timedelta(days=2, hours=9)).astimezone(UTC),
            end_at=(base + timedelta(days=2, hours=10)).astimezone(UTC),
            location="总部报告厅",
            created_by=users[0].id,
        )
        db.add(all_hands)
        db.flush()
        responses = ["accepted", "tentative", "pending", "declined"]
        db.add_all(
            [
                EventParticipant(
                    event_id=all_hands.id,
                    user_id=u.id,
                    is_organizer=i == 0,
                    response="accepted" if i == 0 else responses[(i - 1) % 4],
                )
                for i, u in enumerate(users)
            ]
        )
        tasks = []
        edges = []
        for i in range(5000):
            tid = i + 1
            chain = i < 1200
            tasks.append(
                {
                    "id": tid,
                    "team_id": company.id,
                    "title": f"{'长链验证' if chain else DEPARTMENTS[i % 10]}·任务{tid:05}",
                    "description": "虚构公司项目任务",
                    "created_by": users[0].id,
                    "assignee_id": users[i % 500].id,
                    "due_at": (base + timedelta(days=tid % 60 + 1)).astimezone(UTC),
                    "priority": ["high", "normal", "low"][i % 3],
                    "status": "todo",
                }
            )
            if i and chain:
                edges.append({"task_id": tid, "depends_on_id": tid - 1})
            elif i >= 1200 and i % 20:
                edges.append({"task_id": tid, "depends_on_id": tid - 1})
                if i % 20 >= 3:
                    edges.append({"task_id": tid, "depends_on_id": tid - 3})
        db.execute(Task.__table__.insert(), tasks)
        db.execute(TaskDependency.__table__.insert(), edges)
        # 另一个团队的任务，用来验证不能跨团队建立依赖。
        foreign_team = db.scalar(select(Team).where(Team.invite_code == "DEPT0009"))
        foreign = Task(
            team_id=foreign_team.id,
            title="财务部内部任务",
            created_by=users[450].id,
            assignee_id=users[450].id,
            due_at=base.astimezone(UTC),
        )
        db.add(foreign)
        db.commit()
        ctx = require_member(company.id, users[0], db)
        series_ids = []
        for frequency, offset, count in [("weekly", 4, 12), ("biweekly", 5, 8)]:
            start = (base + timedelta(days=offset, hours=9)).astimezone(UTC)
            result = create_series(
                db,
                ctx,
                users[0],
                EventCreate(
                    title="公司周会" if frequency == "weekly" else "双周产品评审",
                    start_at=start,
                    end_at=start + timedelta(minutes=45),
                    participant_ids=[u.id for u in users[1:20]],
                    recurrence={"frequency": frequency, "count": count},
                    ignore_conflicts=True,
                ),
            )
            series_ids.append(result["series_id"])
        for dep in range(10):
            team = db.scalar(select(Team).where(Team.invite_code == f"DEPT{dep:04}"))
            previous = None
            titles = [
                "收集需求",
                "方案评审",
                "开发实现",
                "接口联调",
                "功能回归",
                "上线发布",
            ]
            for j, title in enumerate(titles):
                task = Task(
                    team_id=team.id,
                    title=f"{DEPARTMENTS[dep]}·{title}",
                    created_by=users[dep * 50].id,
                    assignee_id=users[dep * 50 + j].id,
                    due_at=(base + timedelta(days=j + 1)).astimezone(UTC),
                    status="done" if j == 0 else ("doing" if j == 1 else "todo"),
                    completed_at=datetime.now(UTC) if j == 0 else None,
                )
                db.add(task)
                db.flush()
                if previous:
                    db.add(TaskDependency(task_id=task.id, depends_on_id=previous))
                previous = task.id
        db.commit()
        counts = {
            model.__tablename__: db.scalar(select(func.count()).select_from(model))
            for model in (
                User,
                Team,
                TeamMember,
                Event,
                EventParticipant,
                Task,
                TaskDependency,
            )
        }
        manifest = {
            "random_seed": 20261109,
            "company_team_id": company.id,
            "base_local": base.isoformat(),
            "series_ids": series_ids,
            "optional_busy_id": optional_busy.id,
            "reconfirm_event_id": all_hands.id,
            "chain_first": 1,
            "chain_last": 1200,
            "foreign_task_id": foreign.id,
            "counts": counts,
            "seed_seconds": round(perf_counter() - began, 3),
        }
    (directory / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2)
    )
    with (directory / "accounts.csv").open(
        "w", newline="", encoding="utf-8-sig"
    ) as file:
        writer = csv.writer(file)
        writer.writerow(["username", "display_name", "department", "company_role"])
        writer.writerows(
            (
                f"corp{i + 1:04}",
                f"{DEPARTMENTS[i // 50]}·员工{i + 1:04}",
                DEPARTMENTS[i // 50],
                "owner" if i == 0 else ("admin" if i % 50 == 0 else "member"),
            )
            for i in range(500)
        )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print("独立演示库：", directory / "company.db")
    print(
        "登录：corp0001 / 密码为 COMPANY_DEMO_PASSWORD，未设置时见脚本中的公开演示默认值。"
    )
