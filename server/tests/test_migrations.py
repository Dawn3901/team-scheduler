"""W1-04 迁移可用性测试：空库升级、降级、再升级。"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
BUSINESS_TABLES = {
    "users",
    "teams",
    "team_members",
    "events",
    "event_participants",
    "tasks",
    "notifications",
    "event_series",
    "task_dependencies",
    "personal_events",
}


def _run_alembic(db_path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["SECRET_KEY"] = "test-secret-key"
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=SERVER_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def _tables(db_path: Path) -> set[str]:
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    return {row[0] for row in rows}


def _indexes(db_path: Path, table: str) -> set[str]:
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?",
            (table,),
        ).fetchall()
    return {row[0] for row in rows}


def test_upgrade_head_downgrade_and_upgrade_again(tmp_path: Path) -> None:
    db_path = tmp_path / "migration.db"

    upgrade = _run_alembic(db_path, "upgrade", "head")
    assert upgrade.returncode == 0, upgrade.stderr
    assert BUSINESS_TABLES <= _tables(db_path)
    assert {"idx_team_members_user", "idx_team_one_owner"} <= _indexes(db_path, "team_members")
    with sqlite3.connect(db_path) as connection:
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    assert version == ("6b4e82bbf137",)

    drift = _run_alembic(db_path, "check")
    assert drift.returncode == 0, drift.stdout + drift.stderr

    downgrade = _run_alembic(db_path, "downgrade", "base")
    assert downgrade.returncode == 0, downgrade.stderr
    assert not (BUSINESS_TABLES & _tables(db_path))

    upgrade_again = _run_alembic(db_path, "upgrade", "head")
    assert upgrade_again.returncode == 0, upgrade_again.stderr
    assert BUSINESS_TABLES <= _tables(db_path)


def test_extensions_upgrade_preserves_old_participants_and_downgrades(tmp_path):
    from contextlib import closing

    path = tmp_path / "with-data.db"
    assert _run_alembic(path, "upgrade", "e01de950f6a1").returncode == 0
    with closing(sqlite3.connect(path)) as connection, connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "INSERT INTO users(id,username,password_hash,display_name,created_at,"
            "updated_at) VALUES(1,'old','hash','原用户','2026-01-01','2026-01-01')"
        )
        connection.execute(
            "INSERT INTO teams(id,name,invite_code,owner_id,created_at,"
            "updated_at) VALUES(1,'原团队','ABCDEFGH',1,'2026-01-01','2026-01-01')"
        )
        connection.execute(
            "INSERT INTO events(id,team_id,title,start_at,end_at,all_day,visibility,"
            "status,created_by,created_at,updated_at) VALUES(1,1,'旧活动','2028-01-01',"
            "'2028-01-02',0,'team','confirmed',1,'2026-01-01','2026-01-01')"
        )
        connection.execute(
            "INSERT INTO event_participants(id,event_id,user_id,response,is_organizer,"
            "invited_at) VALUES(1,1,1,'accepted',1,'2026-01-01')"
        )
    upgraded = _run_alembic(path, "upgrade", "head")
    assert upgraded.returncode == 0, upgraded.stderr
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute(
            "SELECT response, needs_confirmation FROM event_participants"
        ).fetchall() == [("accepted", 0)]
        assert connection.execute("SELECT title, series_id FROM events").fetchall() == [
            ("旧活动", None)
        ]
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    downgraded = _run_alembic(path, "downgrade", "e01de950f6a1")
    assert downgraded.returncode == 0, downgraded.stderr
    with closing(sqlite3.connect(path)) as connection:
        assert connection.execute("SELECT response FROM event_participants").fetchall() == [
            ("accepted",)
        ]
        assert connection.execute("SELECT title FROM events").fetchall() == [("旧活动",)]
