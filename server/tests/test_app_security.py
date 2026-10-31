"""R-10 / R-12：安全响应头、版本号与日志级别。"""

import logging

from fastapi.testclient import TestClient

from app import __version__
from app.logging import configure_logging


def test_security_headers_on_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_security_headers_on_error_responses(client: TestClient) -> None:
    response = client.get("/api/v1/not-exist")

    assert response.status_code == 404
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_docs_is_exempt_from_csp(client: TestClient) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" not in response.headers


def test_openapi_uses_single_version_and_mounted_prefix(client: TestClient) -> None:
    body = client.get("/openapi.json").json()

    assert body["info"]["version"] == __version__
    assert "/api/v1/auth/register" in body["paths"]
    assert "/api/v1/auth/login" in body["paths"]
    assert "/api/v1/auth/me" in body["paths"]
    assert "/health" in body["paths"]
    assert "HTTPBearer" in body["components"]["securitySchemes"]


def test_configure_logging_honors_log_level() -> None:
    root = logging.getLogger()
    app_logger = logging.getLogger("app")
    original_root_level = root.level
    original_app_level = app_logger.level

    try:
        assert configure_logging("DEBUG") == logging.DEBUG
        assert root.level == logging.DEBUG
        assert app_logger.level == logging.DEBUG
    finally:
        root.setLevel(original_root_level)
        app_logger.setLevel(original_app_level)
