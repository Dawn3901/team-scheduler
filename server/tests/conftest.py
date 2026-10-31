import atexit
import os
import shutil
import tempfile
from collections.abc import Callable, Generator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# 必须在导入 app.* 之前设置环境变量：config/db 在导入时读取配置。
_TEST_DIR = Path(tempfile.mkdtemp(prefix="teamsync-test-"))
os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-bytes")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test.db'}"
atexit.register(shutil.rmtree, _TEST_DIR, ignore_errors=True)

import app.models  # noqa: F401,E402  确保模型注册到 Base.metadata
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.errors import register_exception_handlers  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Team, TeamMember, User  # noqa: E402
from tests.factories import create_team, create_team_member, create_user  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _test_database() -> Generator[None, None, None]:
    """整个测试会话建一次表；迁移本身由 test_migrations.py 单独验证。"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clean_database(_test_database: None) -> Generator[None, None, None]:
    """每个用例后清空业务表，避免顺序依赖。"""
    yield
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def user_factory(db: Session) -> Callable[..., User]:
    def _create_user(**kwargs: Any) -> User:
        return create_user(db, **kwargs)

    return _create_user


@pytest.fixture()
def team_factory(db: Session) -> Callable[..., Team]:
    def _create_team(**kwargs: Any) -> Team:
        return create_team(db, **kwargs)

    return _create_team


@pytest.fixture()
def team_member_factory(db: Session) -> Callable[..., TeamMember]:
    def _create_team_member(**kwargs: Any) -> TeamMember:
        return create_team_member(db, **kwargs)

    return _create_team_member


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def error_app() -> FastAPI:
    test_app = FastAPI()
    register_exception_handlers(test_app)
    return test_app
