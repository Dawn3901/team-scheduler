"""应用配置。

环境变量优先，其次读取仓库根目录的 .env。
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

# server/app/config.py -> 仓库根目录 / server 目录
ROOT_DIR = Path(__file__).resolve().parents[2]
SERVER_DIR = Path(__file__).resolve().parents[1]


def resolve_database_url(raw: str) -> str:
    """把相对 SQLite 路径固定到 server/，避免随启动目录生成第二个库。"""
    url = make_url(raw)
    if not url.drivername.startswith("sqlite"):
        return raw

    database = url.database
    if not database or database == ":memory:":
        return raw

    path = Path(database)
    if path.is_absolute():
        return raw

    absolute = (SERVER_DIR / path).resolve()
    return url.set(database=absolute.as_posix()).render_as_string(hide_password=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "TeamSync"
    api_v1_prefix: str = "/api/v1"
    secret_key: str
    database_url: str = "sqlite:///./data/teamsync.db"
    cors_origins: str = "http://localhost:5173"
    team_timezone: str = "Asia/Shanghai"
    access_token_expire_days: int = 7
    log_level: str = "INFO"

    @field_validator("database_url")
    @classmethod
    def _resolve_database_url(cls, value: str) -> str:
        return resolve_database_url(value)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
