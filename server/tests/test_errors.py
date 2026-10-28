from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.errors import register_exception_handlers


class _Payload(BaseModel):
    password: str


def test_validation_error_does_not_echo_input() -> None:
    app = FastAPI()
    register_exception_handlers(app)

    @app.post("/echo")
    def echo(payload: _Payload) -> dict[str, str]:
        return {"ok": "1"}

    client = TestClient(app)
    response = client.post("/echo", json={"password": 12345})

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "12345" not in response.text
    assert body["details"]["errors"][0]["loc"] == ["body", "password"]
