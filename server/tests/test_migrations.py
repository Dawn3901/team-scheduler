"""W1-04 迁移可用性测试：空库升级、降级、再升级。"""

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
BUSINESS_TABLES = {"users", "teams", "team_members"}


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
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
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
    assert {"idx_team_members_user", "idx_team_one_owner"} <= _indexes(
        db_path, "team_members"
    )
    with sqlite3.connect(db_path) as connection:
        version = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    assert version == ("0002_w1_db_auth",)

    drift = _run_alembic(db_path, "check")
    assert drift.returncode == 0, drift.stdout + drift.stderr

    downgrade = _run_alembic(db_path, "downgrade", "base")
    assert downgrade.returncode == 0, downgrade.stderr
    assert not (BUSINESS_TABLES & _tables(db_path))

    upgrade_again = _run_alembic(db_path, "upgrade", "head")
    assert upgrade_again.returncode == 0, upgrade_again.stderr
    assert BUSINESS_TABLES <= _tables(db_path)
