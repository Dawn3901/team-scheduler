import atexit
import os
import shutil
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# 必须在导入 app.* 之前设置环境变量：config/db 在导入时读取配置。
_TEST_DIR = Path(tempfile.mkdtemp(prefix="teamsync-test-"))
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DIR / 'test.db'}"
atexit.register(shutil.rmtree, _TEST_DIR, ignore_errors=True)

from app.errors import register_exception_handlers  # noqa: E402
from app.main import app  # noqa: E402


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
