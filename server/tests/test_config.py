import tempfile
from pathlib import Path

import pytest
from pydantic_settings import SettingsConfigDict
from sqlalchemy.engine import make_url

from app import config
from app.config import SERVER_DIR, Settings, load_settings, resolve_database_url


def test_relative_sqlite_path_resolves_under_server() -> None:
    resolved = resolve_database_url("sqlite:///./data/teamsync.db")

    assert Path(make_url(resolved).database or "").resolve() == (
        SERVER_DIR / "data/teamsync.db"
    ).resolve()


def test_absolute_sqlite_path_is_kept() -> None:
    path = (Path(tempfile.gettempdir()) / "teamsync-abs.db").resolve()
    raw = f"sqlite:///{path.as_posix()}"

    assert resolve_database_url(raw) == raw


def test_memory_sqlite_is_kept() -> None:
    assert resolve_database_url("sqlite:///:memory:") == "sqlite:///:memory:"


def test_non_sqlite_url_is_kept() -> None:
    raw = "postgresql://user:pass@localhost/teamsync"

    assert resolve_database_url(raw) == raw


def test_settings_validator_resolves_database_url() -> None:
    settings = Settings(
        secret_key="test",
        database_url="sqlite:///./data/validator.db",
        _env_file=None,
    )

    assert Path(make_url(settings.database_url).database or "").resolve() == (
        SERVER_DIR / "data/validator.db"
    ).resolve()


def test_missing_secret_key_has_actionable_hint(monkeypatch: pytest.MonkeyPatch) -> None:
    class NoEnvFileSettings(Settings):
        model_config = SettingsConfigDict(env_file=None, extra="ignore")

    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setattr(config, "Settings", NoEnvFileSettings)

    with pytest.raises(RuntimeError, match="scripts/init_env.py"):
        load_settings()
