"""R-06：首次运行自动生成 .env。"""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_init_env() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "init_env", REPO_ROOT / "scripts" / "init_env.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_creates_env_with_random_secret(tmp_path: Path) -> None:
    example = tmp_path / ".env.example"
    example.write_text(
        "SECRET_KEY=change-me\n"
        "DATABASE_URL=sqlite:///./data/teamsync.db\n"
        "LOG_LEVEL=INFO\n",
        encoding="utf-8",
    )

    env_path, created = _load_init_env().init_env(tmp_path)

    assert created is True
    content = env_path.read_text(encoding="utf-8")
    assert "SECRET_KEY=change-me" not in content
    secret = next(
        line.split("=", 1)[1]
        for line in content.splitlines()
        if line.startswith("SECRET_KEY=")
    )
    assert len(secret) >= 32
    assert "DATABASE_URL=sqlite:///./data/teamsync.db" in content
    assert "LOG_LEVEL=INFO" in content


def test_existing_env_is_not_overwritten(tmp_path: Path) -> None:
    (tmp_path / ".env.example").write_text("SECRET_KEY=example\n", encoding="utf-8")
    env_path = tmp_path / ".env"
    env_path.write_text("SECRET_KEY=keep-me\n", encoding="utf-8")

    returned_path, created = _load_init_env().init_env(tmp_path)

    assert returned_path == env_path
    assert created is False
    assert env_path.read_text(encoding="utf-8") == "SECRET_KEY=keep-me\n"


def test_missing_example_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        _load_init_env().init_env(tmp_path)
