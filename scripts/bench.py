#!/usr/bin/env python3
"""W5-04：50 用户 / 1 万活动的查询基准。

在独立 SQLite 库中造数并计时，不读写 server/data/teamsync.db。
默认输出到 debug/bench/，可用 --db 指定其他目录。

用法（仓库根目录）：
  server/.venv/Scripts/python.exe scripts/bench.py            # Windows
  server/.venv/bin/python scripts/bench.py                    # Linux/WSL
  server/.venv/Scripts/python.exe scripts/bench.py --reset    # 重建
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--events", type=int, default=10000)
    parser.add_argument("--tasks", type=int, default=5000)
    parser.add_argument("--db", type=Path, default=ROOT / "debug/bench/bench.db")
    parser.add_argument("--reset", action="store_true", help="覆盖已有基准库")
    return parser.parse_args()


def seed_database(db_path: Path, users: int, events: int, tasks: int) -> str:
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ.setdefault("SECRET_KEY", "bench-secret-key-with-at-least-32-bytes")
    os.environ["LOG_LEVEL"] = "WARNING"

    from app.db import Base, SessionLocal, engine
    from app.models import (
        Event,
        EventParticipant,
        Task,
        Team,
        TeamMember,
        User,
        now_utc,
    )
    from app.security import create_access_token, hash_password

    Base.metadata.create_all(engine)
    now = now_utc()
    password_hash = hash_password("bench-password-2026")
    base = datetime(2026, 11, 1, tzinfo=UTC)

    with SessionLocal() as db:
        db.bulk_insert_mappings(
            User,
            [
                {
                    "id": uid,
                    "username": f"bench{uid:03d}",
                    "email": None,
                    "password_hash": password_hash,
                    "display_name": f"基准成员 {uid}",
                    "avatar_color": "#4F46E5",
                    "timezone": "Asia/Shanghai",
                    "created_at": now,
                    "updated_at": now,
                }
                for uid in range(1, users + 1)
            ],
        )
        db.bulk_insert_mappings(
            Team,
            [
                {
                    "id": 1,
                    "name": "W5 基准团队",
                    "description": "scripts/bench.py 造数，不代表真实团队",
                    "invite_code": "BENCH01",
                    "owner_id": 1,
                    "timezone": "Asia/Shanghai",
                    "created_at": now,
                    "updated_at": now,
                }
            ],
        )
        db.bulk_insert_mappings(
            TeamMember,
            [
                {
                    "team_id": 1,
                    "user_id": uid,
                    "role": "owner" if uid == 1 else "member",
                    "status": "active",
                    "joined_at": now,
                }
                for uid in range(1, users + 1)
            ],
        )
        event_rows = []
        participant_rows = []
        for eid in range(1, events + 1):
            start = base + timedelta(
                days=(eid * 7) % 365,
                hours=(eid * 3) % 24,
                minutes=(eid * 11) % 60,
            )
            creator = ((eid - 1) % users) + 1
            event_rows.append(
                {
                    "id": eid,
                    "team_id": 1,
                    "series_id": None,
                    "original_start": None,
                    "title": f"基准活动 {eid}",
                    "description": None,
                    "start_at": start,
                    "end_at": start + timedelta(minutes=60),
                    "all_day": False,
                    "location": None,
                    "color": None,
                    "visibility": "team",
                    "status": "confirmed",
                    "created_by": creator,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            people = {creator, ((eid + 6) % users) + 1, ((eid + 12) % users) + 1}
            for uid in people:
                participant_rows.append(
                    {
                        "event_id": eid,
                        "user_id": uid,
                        "response": "accepted" if uid == creator else "pending",
                        "needs_confirmation": False,
                        "is_organizer": uid == creator,
                        "invited_at": now,
                        "responded_at": None,
                    }
                )
        db.bulk_insert_mappings(Event, event_rows)
        db.bulk_insert_mappings(EventParticipant, participant_rows)
        db.bulk_insert_mappings(
            Task,
            [
                {
                    "id": tid,
                    "team_id": 1,
                    "title": f"基准任务 {tid}",
                    "description": None,
                    "assignee_id": ((tid - 1) % users) + 1,
                    "created_by": 1,
                    "due_at": base + timedelta(days=tid % 365, hours=18),
                    "priority": "normal",
                    "status": "todo",
                    "completed_at": None,
                    "created_at": now,
                    "updated_at": now,
                }
                for tid in range(1, tasks + 1)
            ],
        )
        db.commit()

    return create_access_token(1, "bench001")


def measure(label: str, call, repeats: int = 3) -> dict:
    call()  # 预热连接/编译
    samples = []
    response = None
    for _ in range(repeats):
        started = time.perf_counter()
        response = call()
        samples.append((time.perf_counter() - started) * 1000)
    assert response is not None
    payload = response.json()
    return {
        "query": label,
        "ms_median": round(statistics.median(samples), 2),
        "ms_min": round(min(samples), 2),
        "ms_max": round(max(samples), 2),
        "http_status": response.status_code,
        "bytes": len(response.content),
        "items": payload.get("total", len(payload.get("items", payload.get("members", [])))),
    }


def main() -> int:
    args = parse_args()
    db_path = args.db.resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        if not args.reset:
            print(f"基准库已存在：{db_path}\n如需重建请加 --reset", file=sys.stderr)
            return 2
        for suffix in ("", "-wal", "-shm"):
            Path(str(db_path) + suffix).unlink(missing_ok=True)

    started = time.perf_counter()
    token = seed_database(db_path, args.users, args.events, args.tasks)
    seed_seconds = round(time.perf_counter() - started, 2)

    from app.main import app
    from fastapi.testclient import TestClient

    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(app) as client:
        results = [
            measure(
                "GET /teams/1/events?from=2026-11-01&to=2026-12-02",
                lambda: client.get(
                    "/api/v1/teams/1/events",
                    params={
                        "from": "2026-11-01T00:00:00Z",
                        "to": "2026-12-02T00:00:00Z",
                        "limit": "100",
                    },
                    headers=headers,
                ),
            ),
            measure(
                "GET /teams/1/availability?from=2026-11-01&to=2026-11-08",
                lambda: client.get(
                    "/api/v1/teams/1/availability",
                    params={
                        "from": "2026-11-01T00:00:00Z",
                        "to": "2026-11-08T00:00:00Z",
                    },
                    headers=headers,
                ),
            ),
            measure(
                "GET /teams/1/tasks?limit=100",
                lambda: client.get(
                    "/api/v1/teams/1/tasks",
                    params={"limit": "100"},
                    headers=headers,
                ),
            ),
        ]

    report = {
        "dataset": {
            "users": args.users,
            "events": args.events,
            "tasks": args.tasks,
            "participants": args.events * 3,
            "seed_seconds": seed_seconds,
            "db": str(db_path),
        },
        "results": results,
        "note": "单机 TestClient 串行，含路由/鉴权/序列化/SQLite；不是网络或并发 p95。",
    }
    output = db_path.parent / "report.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"dataset: {args.users} users / {args.events} events / {args.tasks} tasks")
    print(f"seed: {seed_seconds}s")
    print(f"{'query':<58} {'median':>9} {'min':>8} {'max':>8} {'bytes':>9} {'items':>7}")
    for row in results:
        print(
            f"{row['query']:<58} {row['ms_median']:>8.2f}ms {row['ms_min']:>7.2f} {row['ms_max']:>7.2f}"
            f" {row['bytes']:>9} {row['items']:>7}"
        )
    print(f"report: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
