from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.db import get_db
from app.main import app


class _BrokenSession:
    def execute(self, *args: object, **kwargs: object) -> None:
        raise SQLAlchemyError("db down")


def _broken_db() -> Generator[_BrokenSession, None, None]:
    yield _BrokenSession()


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_health_db_failure_is_503(client: TestClient) -> None:
    app.dependency_overrides[get_db] = _broken_db

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "db": "error"}


def test_unknown_route_uses_error_contract(client: TestClient) -> None:
    response = client.get("/api/v1/not-exist")

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert response.json()["message"] == "资源不存在"
    assert set(response.json()) == {"code", "message", "details"}


def test_method_not_allowed_uses_error_contract(client: TestClient) -> None:
    response = client.post("/health")

    assert response.status_code == 405
    assert response.json()["code"] == "METHOD_NOT_ALLOWED"
    assert response.json()["message"] == "请求方法不允许"
    assert response.headers["allow"] == "GET"
