"""FastAPI 应用装配。"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app import __version__
from app.config import get_settings
from app.db import SessionLocal
from app.errors import register_exception_handlers
from app.logging import add_request_logging, configure_logging
from app.models import Event, Task, TeamMember
from app.realtime.channel import (
    emit,
    lifespan,
    publish_resource,
    refresh_notifications,
    refresh_team,
)
from app.realtime.channel import router as ws_router
from app.routers import auth, health, teams, work

CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
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
            response.headers.setdefault("Content-Security-Policy", CSP)
        return response


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
    app.include_router(ws_router, prefix=settings.api_v1_prefix)

    @app.middleware("http")
    async def broadcast_changes(request: Request, call_next):
        response = await call_next(request)
        if request.method in {"POST", "PATCH", "DELETE"} and response.status_code < 300:
            parts = request.url.path.removeprefix(settings.api_v1_prefix).strip("/").split("/")
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

    register_exception_handlers(app)
    _add_security_headers(app)
    add_request_logging(app)
    return app


app = create_app()
