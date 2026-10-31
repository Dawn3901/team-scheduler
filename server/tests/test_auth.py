"""W1-05 认证接口测试（AUTH-1..4, 6）。"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User
from app.security import create_access_token, decode_access_token, verify_password

PASSWORD = "correct-horse"


def _register(
    client: TestClient,
    *,
    username: str = "lin",
    password: str = PASSWORD,
    display_name: str = "林",
    email: str | None = None,
):
    payload = {
        "username": username,
        "display_name": display_name,
        "password": password,
    }
    if email is not None:
        payload["email"] = email
    return client.post("/api/v1/auth/register", json=payload)


def _login(client: TestClient, *, username: str = "lin", password: str = PASSWORD):
    return client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_returns_201_token_and_safe_user(client: TestClient, db: Session) -> None:
    response = _register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert set(body["user"]) == {"id", "username", "display_name", "avatar_color"}
    assert body["user"]["username"] == "lin"
    assert "password" not in response.text
    assert "password_hash" not in response.text

    token_payload = decode_access_token(body["access_token"])
    assert token_payload["sub"] == str(body["user"]["id"])
    assert token_payload["username"] == "lin"
    assert token_payload["exp"] - token_payload["iat"] == 7 * 24 * 3600

    user = db.scalar(select(User).where(User.username == "lin"))
    assert user is not None
    assert user.password_hash != PASSWORD
    assert user.password_hash.startswith("$2b$12$")
    assert verify_password(PASSWORD, user.password_hash)


def test_register_duplicate_username_is_409(client: TestClient, db: Session) -> None:
    assert _register(client).status_code == 201

    response = _register(client)

    assert response.status_code == 409
    assert response.json()["code"] == "USERNAME_TAKEN"
    assert db.scalar(select(User).where(User.username == "lin")) is not None
    assert db.scalar(select(func.count()).select_from(User)) == 1


def test_register_short_password_is_422(client: TestClient) -> None:
    response = _register(client, password="1234567")

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PASSWORD"
    assert "至少 8 位" in response.json()["message"]


def test_register_too_long_password_is_422(client: TestClient) -> None:
    response = _register(client, password="a" * 73)

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_PASSWORD"


def test_register_duplicate_email_is_409(client: TestClient) -> None:
    assert _register(client, username="lin", email="lin@example.com").status_code == 201

    response = _register(client, username="chen", email="lin@example.com")

    assert response.status_code == 409
    assert response.json()["code"] == "CONFLICT"
    assert response.json()["details"] == {"field": "email"}


def test_register_allows_multiple_empty_emails(client: TestClient) -> None:
    assert _register(client, username="lin").status_code == 201
    assert _register(client, username="chen").status_code == 201


def test_register_missing_fields_is_400(client: TestClient) -> None:
    response = client.post("/api/v1/auth/register", json={"username": "lin"})

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_login_returns_token_and_user(client: TestClient) -> None:
    assert _register(client).status_code == 201

    response = _login(client)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["username"] == "lin"
    assert decode_access_token(body["access_token"])["sub"] == str(body["user"]["id"])


def test_login_wrong_password_is_401(client: TestClient) -> None:
    assert _register(client).status_code == 201

    response = _login(client, password="wrong-password")

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"


def test_login_unknown_user_uses_same_error(client: TestClient) -> None:
    response = _login(client, username="nobody")

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"
    assert response.json()["message"] == "用户名或密码错误"


def test_me_requires_token(client: TestClient) -> None:
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_returns_current_user(client: TestClient) -> None:
    register = _register(client)
    token = register.json()["access_token"]

    response = client.get("/api/v1/auth/me", headers=_auth_headers(token))

    assert response.status_code == 200
    assert response.json() == register.json()["user"]


def test_me_rejects_malformed_token(client: TestClient) -> None:
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-jwt"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_me_rejects_expired_token(client: TestClient) -> None:
    register = _register(client)
    user = register.json()["user"]
    expired = create_access_token(
        user["id"],
        user["username"],
        now=datetime.now(UTC) - timedelta(days=8),
    )

    response = client.get("/api/v1/auth/me", headers=_auth_headers(expired))

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_me_rejects_token_for_deleted_user(client: TestClient, db: Session) -> None:
    register = _register(client)
    token = register.json()["access_token"]
    user = db.scalar(select(User).where(User.username == "lin"))
    assert user is not None

    db.delete(user)
    db.commit()

    response = client.get("/api/v1/auth/me", headers=_auth_headers(token))

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_patch_me_updates_display_name_and_color(client: TestClient) -> None:
    register = _register(client)
    token = register.json()["access_token"]

    response = client.patch(
        "/api/v1/auth/me",
        headers=_auth_headers(token),
        json={"display_name": "林同学", "avatar_color": "#16A34A"},
    )

    assert response.status_code == 200
    assert response.json()["display_name"] == "林同学"
    assert response.json()["avatar_color"] == "#16A34A"

    me = client.get("/api/v1/auth/me", headers=_auth_headers(token))
    assert me.json()["display_name"] == "林同学"
    assert me.json()["avatar_color"] == "#16A34A"


def test_patch_me_rejects_invalid_color(client: TestClient) -> None:
    register = _register(client)
    token = register.json()["access_token"]

    response = client.patch(
        "/api/v1/auth/me",
        headers=_auth_headers(token),
        json={"avatar_color": "green"},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_patch_me_requires_token(client: TestClient) -> None:
    response = client.patch("/api/v1/auth/me", json={"display_name": "林同学"})

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


def test_auth_flows_do_not_log_passwords(client: TestClient, caplog) -> None:
    secret = "super-secret-password"
    with caplog.at_level(logging.DEBUG):
        assert _register(client, password=secret).status_code == 201
        assert _login(client, password=secret).status_code == 200

    assert secret not in caplog.text
