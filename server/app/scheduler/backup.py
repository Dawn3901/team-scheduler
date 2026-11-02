"""OPS-4：SQLite 在线一致性备份，按日保留最近七份。"""

import sqlite3
from datetime import datetime
from pathlib import Path

from sqlalchemy.engine import make_url

from app.models import now_utc


def backup_sqlite(database_url: str, now: datetime | None = None) -> Path | None:
    url = make_url(database_url)
    if not url.drivername.startswith("sqlite") or not url.database or url.database == ":memory:":
        return None
    source = Path(url.database)
    if not source.is_file():
        return None
    directory = source.parent / "backups"
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"teamsync-{(now or now_utc()).date().isoformat()}.db"
    if not target.exists():
        temporary = target.with_suffix(".db.tmp")
        try:
            with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as src:
                with sqlite3.connect(temporary) as dest:
                    src.backup(dest)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    for old in sorted(directory.glob("teamsync-????-??-??.db"), reverse=True)[7:]:
        old.unlink()
    return target
