from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_unknown_route_uses_error_contract() -> None:
    response = client.get("/api/v1/not-exist")

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert set(response.json()) == {"code", "message", "details"}


def test_method_not_allowed_uses_error_contract() -> None:
    response = client.post("/health")

    assert response.status_code == 405
    assert response.json()["code"] == "METHOD_NOT_ALLOWED"
