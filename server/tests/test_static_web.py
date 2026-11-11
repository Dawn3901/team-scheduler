"""W5-05：单进程托管 Web 构建的静态路由与 CSP。"""

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


def test_serve_web_static_spa_and_api_csp(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(
        "<!doctype html><title>TeamSync Test</title>", encoding="utf-8"
    )
    (dist / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")
    (dist / "assets" / "app.css").write_text("body{color:#111}", encoding="utf-8")

    monkeypatch.setenv("SERVE_WEB", "1")
    monkeypatch.setenv("WEB_DIST", str(dist))
    get_settings.cache_clear()
    try:
        app = create_app()
        with TestClient(app) as client:
            root = client.get("/")
            assert root.status_code == 200
            assert "TeamSync Test" in root.text
            assert "default-src 'self'" in root.headers["content-security-policy"]

            spa = client.get("/app/teams/1/calendar")
            assert spa.status_code == 200
            assert "TeamSync Test" in spa.text

            asset = client.get("/assets/app.js")
            assert asset.status_code == 200
            assert "console.log" in asset.text

            missing = client.get("/api/v1/does-not-exist")
            assert missing.status_code == 404

            health = client.get("/health")
            assert health.status_code == 200
            assert health.headers["content-security-policy"] == (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
            )
    finally:
        get_settings.cache_clear()
