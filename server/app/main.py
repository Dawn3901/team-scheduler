"""FastAPI 应用装配。"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app import __version__
from app.config import ROOT_DIR, get_settings
from app.db import SessionLocal
from app.errors import register_exception_handlers
from app.logging import add_request_logging, configure_logging
from app.models import Event, Task, TeamMember
from app.realtime.channel import (
    emit,
    lifespan,
    publish_personal,
    publish_resource,
    refresh_notifications,
    refresh_team,
)
from app.realtime.channel import router as ws_router
from app.routers import auth, health, personal, teams, work

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
WEB_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: wss:; "
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
}
# Swagger/ReDoc 需要加载外部脚本，CSP 只加在业务/健康检查响应上。
DOC_PATHS = {"/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"}


def _add_security_headers(app: FastAPI) -> None:
    @app.middleware("http")
    async def _security_headers(request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path not in DOC_PATHS:
            is_api = request.url.path == "/health" or request.url.path.startswith("/api")
            response.headers.setdefault(
                "Content-Security-Policy", API_CSP if is_api else WEB_CSP
            )
        return response


def _mount_web(app: FastAPI, web_dist_value: str) -> None:
    """W5-05：可选地由 FastAPI 托管 Web 构建，单进程即可局域网访问。"""
    web_dist = Path(web_dist_value)
    if not web_dist.is_absolute():
        web_dist = (ROOT_DIR / web_dist).resolve()
    assets = web_dist / "assets"
    index = web_dist / "index.html"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="web-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not Found")
        target = (web_dist / full_path).resolve()
        if web_dist in target.parents and target.is_file():
            return FileResponse(target)
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Web dist 未构建")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=f"{settings.app_name} API", version=__version__, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix=settings.api_v1_prefix)
    app.include_router(teams.router, prefix=settings.api_v1_prefix)
    app.include_router(work.router, prefix=settings.api_v1_prefix)
    app.include_router(personal.router, prefix=settings.api_v1_prefix)
    app.include_router(ws_router, prefix=settings.api_v1_prefix)

    @app.middleware("http")
    async def broadcast_changes(request: Request, call_next):
        response = await call_next(request)
        if request.method in {"POST", "PATCH", "DELETE"} and response.status_code < 300:
            parts = request.url.path.removeprefix(settings.api_v1_prefix).strip("/").split("/")
            if parts and parts[0] == "me":
                # CR-002：个人日历只通知 owner，不触发团队广播。
                user_id = getattr(request.state, "user_id", None)
                if user_id:
                    publish_personal(int(user_id))
                return response
            with SessionLocal() as db:
                team_ids = []
                if len(parts) > 1 and parts[1].isdigit():
                    resource_id = int(parts[1])
                    if parts[0] == "teams":
                        team_ids = [resource_id]
                    elif parts[0] in {"events", "tasks"}:
                        item = db.get(Event if parts[0] == "events" else Task, resource_id)
                        if item:
                            team_ids = [item.team_id]
                            publish_resource(
                                parts[0],
                                resource_id,
                                request.method,
                                parts[2] if len(parts) > 2 else "",
                            )
                elif parts[0] == "teams":
                    team_ids = list(db.scalars(select(TeamMember.team_id).distinct()))
            if (
                len(parts) > 3
                and parts[0] == "teams"
                and parts[2] == "members"
                and request.method == "DELETE"
            ):
                emit(
                    int(parts[3]),
                    "member.left",
                    {"team_id": int(parts[1]), "user_id": int(parts[3])},
                )
            for tid in team_ids:
                refresh_team(tid)
            refresh_notifications()
        return response

    if settings.serve_web:
        _mount_web(app, settings.web_dist)

    register_exception_handlers(app)
    _add_security_headers(app)
    add_request_logging(app)
    return app


app = create_app()
