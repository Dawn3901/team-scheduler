import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.errors import ApiError


class _Payload(BaseModel):
    password: str


def _client(app: FastAPI, *, raise_server_exceptions: bool = True) -> TestClient:
    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def test_validation_error_is_400_and_does_not_echo_input(error_app: FastAPI) -> None:
    @error_app.post("/echo")
    def echo(payload: _Payload) -> dict[str, str]:
        return {"ok": "1"}

    response = _client(error_app).post("/echo", json={"password": 12345})

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "12345" not in response.text
    assert body["details"]["errors"][0]["loc"] == ["body", "password"]


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (409, "USERNAME_TAKEN"),
        (422, "INVALID_PASSWORD"),
        (422, "INVALID_TIME_RANGE"),
    ],
)
def test_api_error_keeps_specific_code(error_app: FastAPI, status: int, code: str) -> None:
    @error_app.get("/business")
    def business() -> None:
        raise ApiError(status, code, "业务错误", {"field": "value"})

    response = _client(error_app).get("/business")

    assert response.status_code == status
    assert response.json() == {
        "code": code,
        "message": "业务错误",
        "details": {"field": "value"},
    }


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (409, "CONFLICT"),
        (422, "UNPROCESSABLE_ENTITY"),
    ],
)
def test_http_exception_uses_fallback_code(error_app: FastAPI, status: int, code: str) -> None:
    @error_app.get("/fallback")
    def fallback() -> None:
        raise HTTPException(status_code=status, detail="fallback")

    response = _client(error_app).get("/fallback")

    assert response.status_code == status
    assert response.json()["code"] == code


def test_http_exception_preserves_headers(error_app: FastAPI) -> None:
    @error_app.get("/limited")
    def limited() -> None:
        raise HTTPException(status_code=429, detail="slow down", headers={"Retry-After": "60"})

    response = _client(error_app).get("/limited")

    assert response.status_code == 429
    assert response.json()["code"] == "RATE_LIMITED"
    assert response.headers["retry-after"] == "60"


def test_unhandled_error_returns_500(error_app: FastAPI) -> None:
    @error_app.get("/crash")
    def crash() -> None:
        raise RuntimeError("boom")

    response = _client(error_app, raise_server_exceptions=False).get("/crash")

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
