"""日志配置：让 LOG_LEVEL 真正生效。"""

import logging

DEFAULT_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging(level: str) -> int:
    """按配置设置 root 与 app logger 级别，返回解析后的 logging 常量。"""
    resolved = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(level=resolved, format=DEFAULT_FORMAT)
    for handler in logging.getLogger().handlers:
        if type(handler) is logging.StreamHandler:
            handler.setFormatter(JsonFormatter())
    logging.getLogger().setLevel(resolved)
    logging.getLogger("app").setLevel(resolved)
    for name in ("uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        if not any(isinstance(f, RedactTokenFilter) for f in logger.filters):
            logger.addFilter(RedactTokenFilter())
    return resolved


class RedactTokenFilter(logging.Filter):
    """uvicorn 会记录 WS 查询串；过滤器避免 JWT 进入访问日志。"""

    def filter(self, record: logging.LogRecord) -> bool:
        import re

        def clean(value):
            if isinstance(value, str):
                return re.sub(r'([?&]token=)[^\s"&]+', r"\1[REDACTED]", value)
            return value

        record.msg = clean(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(clean(value) for value in record.args)
        elif isinstance(record.args, dict):
            record.args = {key: clean(value) for key, value in record.args.items()}
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        import json

        body = {"level": record.levelname, "logger": record.name, "message": record.getMessage()}
        for name in ("request_id", "user_id", "team_id", "method", "path", "status"):
            body[name] = getattr(record, name, None)
        return json.dumps(body, ensure_ascii=False)


def add_request_logging(app) -> None:
    import uuid

    import jwt
    from fastapi import Request

    from app.security import decode_access_token

    @app.middleware("http")
    async def log_request(request: Request, call_next):
        request_id = uuid.uuid4().hex
        uid = None
        authorization = request.headers.get("authorization", "")
        if authorization.startswith("Bearer "):
            try:
                uid = int(decode_access_token(authorization[7:])["sub"])
            except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
                pass
        parts = request.url.path.strip("/").split("/")
        tid = None
        if "teams" in parts:
            index = parts.index("teams") + 1
            if index < len(parts) and parts[index].isdigit():
                tid = int(parts[index])
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            logging.getLogger("app.requests").info(
                "http_request",
                extra={
                    "request_id": request_id,
                    "user_id": uid,
                    "team_id": tid,
                    "method": request.method,
                    "path": request.url.path,
                    "status": status,
                },
            )
