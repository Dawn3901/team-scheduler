"""在SQLite备份副本上验证真实HTTP路由、业务与数据，不改演示库。"""

import json
import platform
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter

from app.db import SessionLocal, engine
from app.main import app
from app.models import (
    Event,
    EventParticipant,
    EventSeries,
    Notification,
    TaskDependency,
)
from app.scheduler.reminders import scan_reminders
from app.security import create_access_token
from fastapi.testclient import TestClient
from sqlalchemy import event as sql_event
from sqlalchemy import func, select, text


def ensure(condition, message="结果未满足预期"):
    if not condition:
        raise AssertionError(message)


def verify(directory: Path):
    manifest = json.loads((directory / "manifest.json").read_text())
    base = datetime.fromisoformat(manifest["base_local"]).astimezone(UTC)
    tid = manifest["company_team_id"]
    results, timings = [], []
    queries = 0

    def listener(*args):
        nonlocal queries
        queries += 1

    sql_event.listen(engine, "before_cursor_execute", listener)
    # 不进入lifespan，不启动后台定时扫描；提醒测试显式传入时钟。
    client = TestClient(app)
    owner = {"Authorization": "Bearer " + create_access_token(1, "corp0001")}

    def request(method, path, expected=200, **kwargs):
        before, started = queries, perf_counter()
        response = client.request(method, "/api/v1" + path, headers=owner, **kwargs)
        timings.append(
            {
                "method": method,
                "path": path,
                "status": response.status_code,
                "ms": round((perf_counter() - started) * 1000, 2),
                "sql": queries - before,
                "response_bytes": len(response.content),
            }
        )
        ensure(
            response.status_code == expected,
            f"{response.status_code}: {response.text[:300]}",
        )
        return response.json() if response.content else None

    def run(name, function):
        started = perf_counter()
        try:
            function()
            result = {"name": name, "passed": True}
        except Exception as exc:  # noqa: BLE001 - 汇总各场景失败，继续独立检查
            result = {
                "name": name,
                "passed": False,
                "error": f"{type(exc).__name__}: {exc}",
            }
        result["ms"] = round((perf_counter() - started) * 1000, 2)
        results.append(result)
        print(("PASS " if result["passed"] else "FAIL ") + name, flush=True)

    def count(model, *conditions):
        with SessionLocal() as db:
            return db.scalar(select(func.count()).select_from(model).where(*conditions))

    def suggest(**extra):
        return request(
            "GET",
            f"/teams/{tid}/availability/suggestions",
            params={
                "from": base.isoformat(),
                "to": (base + timedelta(hours=9)).isoformat(),
                "duration_minutes": 60,
                **extra,
            },
        )

    def check_candidates(data, required):
        with SessionLocal() as db:
            for candidate in data["suggestions"]:
                a = datetime.fromisoformat(candidate["start_at"])
                b = datetime.fromisoformat(candidate["end_at"])
                overlap = db.scalar(
                    select(func.count())
                    .select_from(Event)
                    .join(EventParticipant, Event.id == EventParticipant.event_id)
                    .where(
                        Event.team_id == tid,
                        Event.status == "confirmed",
                        Event.deleted_at.is_(None),
                        Event.start_at < b,
                        Event.end_at > a,
                        EventParticipant.user_id.in_(required),
                        EventParticipant.response != "declined",
                    )
                )
                ensure(overlap == 0)
                ensure(set(required) <= set(candidate["available_member_ids"]))
                ensure(0.7 <= candidate["score"] <= 1)
        items = data["suggestions"]
        for i, left in enumerate(items):
            for right in items[i + 1 :]:
                ensure(
                    left["end_at"] <= right["start_at"]
                    or right["end_at"] <= left["start_at"]
                )

    def recommendation():
        result = suggest()
        ensure(result["suggestions"], "500人应在10:00–11:00保留共同空闲窗口")
        check_candidates(result, list(range(1, 501)))
        candidate = result["suggestions"][0]
        created = request(
            "POST",
            f"/teams/{tid}/events",
            201,
            json={
                "title": "推荐结果建活动",
                "start_at": candidate["start_at"],
                "end_at": candidate["end_at"],
                "participant_ids": list(range(2, 501)),
            },
        )
        ensure(len(created["participants"]) == 500)
        request("DELETE", f"/events/{created['id']}", 204)

    def login():
        import os

        response = request(
            "POST",
            "/auth/login",
            json={
                "username": "corp0001",
                "password": os.environ.get("COMPANY_DEMO_PASSWORD", "CompanyDemo2026!"),
            },
        )
        ensure(response["user"]["username"] == "corp0001")
        ensure(bool(response["access_token"]))

    run("演示账号通过真实登录接口", login)
    run("500人推荐独立查库并带入创建500人活动", recommendation)

    def ranking():
        result = suggest(
            member_ids=",".join(map(str, range(1, 121))),
            required_ids=",".join(map(str, range(1, 21))),
            work_end="10:00",
        )
        ensure(result["suggestions"][0]["score"] == 0.7)
        ensure(len(result["suggestions"][0]["missing_optional_ids"]) == 100)
        ensure("收购" not in json.dumps(result, ensure_ascii=False))
        ensure("event_id" not in json.dumps(result))
        check_candidates(result, list(range(1, 21)))

    run("必到20人可选100人的评分与私密脱敏", ranking)
    run(
        "500人忙碌时返回空推荐",
        lambda: ensure(
            not suggest(work_start="11:00", work_end="12:00")["suggestions"]
        ),
    )

    def buffer():
        value = suggest(
            member_ids="1,2", required_ids="1", buffer_minutes=15, duration_minutes=30
        )["suggestions"][0]
        start = datetime.fromisoformat(value["start_at"])
        ensure(start >= base + timedelta(minutes=15))
        check_candidates({"suggestions": [value]}, [1])

    run("15分钟缓冲与工作窗口边界", buffer)
    run(
        "500人30天推荐查询",
        lambda: check_candidates(
            suggest(to=(base + timedelta(days=30)).isoformat()), list(range(1, 501))
        ),
    )
    series = {}

    def create_series():
        start = base + timedelta(hours=11)
        for frequency, total in [("weekly", 52), ("biweekly", 26)]:
            value = request(
                "POST",
                f"/teams/{tid}/events",
                201,
                json={
                    "title": "上限系列·" + frequency,
                    "start_at": start.isoformat(),
                    "end_at": (start + timedelta(minutes=30)).isoformat(),
                    "participant_ids": list(range(2, 21)),
                    "ignore_conflicts": True,
                    "recurrence": {"frequency": frequency, "count": total},
                },
            )
            ensure(value["series_count"] == total)
            with SessionLocal() as db:
                rows = list(
                    db.scalars(
                        select(Event)
                        .where(Event.series_id == value["series_id"])
                        .order_by(Event.original_start)
                    )
                )
                ensure(len(rows) == total)
                ensure(
                    (rows[1].start_at - rows[0].start_at).days
                    == (7 if frequency == "weekly" else 14)
                )
                series[frequency] = [row.id for row in rows]

    run("52次每周和26次双周系列展开与间隔", create_series)

    def scopes():
        ids = series["weekly"]
        request("PATCH", f"/events/{ids[0]}", json={"title": "仅本次修改"})
        ensure(request("GET", f"/events/{ids[1]}")["title"] != "仅本次修改")
        request("PATCH", f"/events/{ids[3]}", json={"status": "cancelled"})
        result = request(
            "PATCH", f"/events/{ids[1]}", json={"scope": "future", "title": "未来修改"}
        )
        ensure(result["affected_count"] == 50)
        result = request(
            "PATCH", f"/events/{ids[0]}", json={"scope": "all", "title": "整个系列"}
        )
        ensure(result["affected_count"] == 51)
        ensure(request("GET", f"/events/{ids[3]}")["status"] == "cancelled")

    run("本次未来整个系列及取消例外", scopes)

    def rollback():
        before = [count(model) for model in (Event, EventSeries, Notification)]
        request(
            "POST",
            f"/teams/{tid}/events",
            409,
            json={
                "title": "冲突应整批回滚",
                "start_at": (base + timedelta(hours=2)).isoformat(),
                "end_at": (base + timedelta(hours=3)).isoformat(),
                "participant_ids": list(range(2, 501)),
                "recurrence": {"frequency": "weekly", "count": 52},
            },
        )
        ensure([count(model) for model in (Event, EventSeries, Notification)] == before)

    run("52次系列冲突时活动规则通知整批回滚", rollback)

    def long_cycle():
        ensure(
            request("PATCH", "/tasks/1", 422, json={"dependency_ids": [1200]})["code"]
            == "DEPENDENCY_CYCLE"
        )
        with SessionLocal() as db:
            ensure(
                db.scalar(select(TaskDependency).where(TaskDependency.task_id == 1))
                is None
            )

    run("1200层依赖链查环且失败不写入", long_cycle)

    def unlock():
        ensure(
            request("PATCH", "/tasks/2", 409, json={"status": "doing"})["code"]
            == "TASK_BLOCKED"
        )
        request("POST", "/tasks/1/complete")
        ensure(not request("PATCH", "/tasks/2", json={"status": "doing"})["blocked"])
        ensure(request("POST", "/tasks/1/reopen", 409)["code"] == "DEPENDENCY_IN_USE")
        ensure(request("DELETE", "/tasks/1", 409)["code"] == "DEPENDENCY_IN_USE")

    run("阻塞完成解锁及重开删除保护", unlock)
    run(
        "依赖拒绝跨团队引用",
        lambda: ensure(
            request(
                "PATCH",
                "/tasks/3",
                422,
                json={"dependency_ids": [manifest["foreign_task_id"]]},
            )["code"]
            == "INVALID_DEPENDENCY"
        ),
    )
    run(
        "下游截止早于前置的警告",
        lambda: ensure(
            request("PATCH", "/tasks/3", json={"due_at": base.isoformat()})[
                "dependency_warnings"
            ]
        ),
    )

    def graph():
        result = request("GET", f"/teams/{tid}/tasks/dependency-graph")
        ensure(len(result["nodes"]) == 5000)
        ensure(len(result["edges"]) == 8039)
        nodes = {n["id"] for n in result["nodes"]}
        ensure(all(e["from"] in nodes and e["to"] in nodes for e in result["edges"]))

    run("5000节点8039边依赖图及团队隔离", graph)
    eid = manifest["reconfirm_event_id"]

    def reconfirm():
        expected = count(
            EventParticipant,
            EventParticipant.event_id == eid,
            EventParticipant.is_organizer.is_(False),
            EventParticipant.response.in_(["accepted", "tentative"]),
        )
        before = count(Notification, Notification.type == "event.updated")
        result = request(
            "PATCH",
            f"/events/{eid}",
            json={"location": "新总部报告厅", "ignore_conflicts": True},
        )
        ensure(sum(p["needs_confirmation"] for p in result["participants"]) == expected)
        ensure(
            count(Notification, Notification.type == "event.updated")
            == before + expected
        )
        request(
            "PATCH",
            f"/events/{eid}",
            json={"location": "新总部报告厅", "ignore_conflicts": True},
        )
        ensure(
            count(Notification, Notification.type == "event.updated")
            == before + expected
        )
        ensure(
            all(
                p["response"] == "pending"
                for p in result["participants"]
                if p["needs_confirmation"]
            )
        )

    run("500人会议精确重置回应并通知去重", reconfirm)

    def respond():
        response = client.patch(
            f"/api/v1/events/{eid}/rsvp",
            headers={"Authorization": "Bearer " + create_access_token(2, "corp0002")},
            json={"response": "accepted"},
        )
        ensure(
            response.status_code == 200 and not response.json()["needs_confirmation"]
        )

    run("重新回应清除确认标记", respond)

    def reminders():
        old = base + timedelta(days=2, hours=9)
        with SessionLocal() as db:
            scan_reminders(db, old - timedelta(minutes=10))
        before = count(Notification, Notification.type == "event.reminder")
        request(
            "PATCH",
            f"/events/{eid}",
            json={
                "start_at": (old + timedelta(hours=1)).isoformat(),
                "end_at": (old + timedelta(hours=2)).isoformat(),
                "ignore_conflicts": True,
            },
        )
        with SessionLocal() as db:
            scan_reminders(db, old + timedelta(minutes=50))
        after = count(Notification, Notification.type == "event.reminder")
        ensure(after > before)
        with SessionLocal() as db:
            scan_reminders(db, old + timedelta(minutes=50))
        ensure(count(Notification, Notification.type == "event.reminder") == after)

    run("改期按新时间提醒且重复扫描不重复", reminders)

    def isolation():
        request("GET", "/teams/11/tasks/dependency-graph", 404)
        request("GET", f"/events/{manifest['optional_busy_id']}", 404)

    run("部门隔离与私密详情权限", isolation)

    def all_pages(resource, key, expected):
        ids = []
        offset = 0
        while True:
            result = request(
                "GET",
                f"/teams/{tid}/{resource}",
                params={"limit": 100, "offset": offset},
            )
            ensure(result["total"] == expected)
            rows = result["items"]
            ids.extend(row[key] for row in rows)
            offset += len(rows)
            if offset >= result["total"]:
                break
            ensure(rows, "尚未取完数据却返回空页")
        ensure(len(ids) == len(set(ids)) == expected)

    run("成员5页取全500人且无重复遗漏", lambda: all_pages("members", "user_id", 500))
    run("任务50页取全5000项且无重复遗漏", lambda: all_pages("tasks", "id", 5000))
    for name, path, params in [
        ("成员默认分页", f"/teams/{tid}/members", {}),
        ("任务分页100条", f"/teams/{tid}/tasks", {"limit": 100}),
        (
            "日历月查询100条",
            f"/teams/{tid}/events",
            {
                "from": base.isoformat(),
                "to": (base + timedelta(days=30)).isoformat(),
                "limit": 100,
            },
        ),
    ]:
        run(name, lambda path=path, params=params: request("GET", path, params=params))
    with SessionLocal() as db:
        integrity = db.execute(text("PRAGMA integrity_check")).scalar()
        foreign_keys = db.execute(text("PRAGMA foreign_key_check")).all()
    run("SQLite完整性和外键", lambda: ensure(integrity == "ok" and not foreign_keys))
    sql_event.remove(engine, "before_cursor_execute", listener)
    client.close()
    report = {
        "machine": platform.platform(),
        "python": platform.python_version(),
        "generated_at": datetime.now(UTC).isoformat(),
        "seed": manifest,
        "mode": "串行进程内TestClient，真实HTTP路由和SQLite；不含网络、浏览器渲染或并发压测",
        "passed": sum(r["passed"] for r in results),
        "total": len(results),
        "cases": results,
        "requests": timings,
    }
    (directory / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)
    )
    lines = [
        "# 大公司模拟数据测试",
        "",
        f"自动检查：{report['passed']}/{report['total']} 通过。",
        "",
        report["mode"],
        "",
        "## 场景",
        "",
        "| 场景 | 结果 | ms |",
        "|---|---|---:|",
    ]
    lines += [
        f"| {r['name']} | {'通过' if r['passed'] else r['error']} | {r['ms']} |"
        for r in results
    ]
    lines += [
        "",
        "## 单次接口观测",
        "",
        "单次观测不能当作 p95 或生产容量。",
        "",
        "| 接口 | 状态 | ms | SQL条数 | 字节 |",
        "|---|---:|---:|---:|---:|",
    ]
    lines += [
        f"| {r['method']} {r['path']} | {r['status']} | {r['ms']} | {r['sql']} | {r['response_bytes']} |"
        for r in timings
    ]
    lines += [
        "",
        "验证在在线备份副本执行，原始演示库保留。",
        "未验证：5000节点浏览器渲染、Android大数据交互、真实网络、多进程及多用户并发。",
    ]
    (directory / "report.md").write_text("\n".join(lines) + "\n")
    print(
        f"结果：{report['passed']}/{report['total']}；报告：{directory / 'report.md'}",
        flush=True,
    )
    return report["passed"] == report["total"]
