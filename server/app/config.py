"""应用配置。

环境变量优先，其次读取仓库根目录的 .env。
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# server/app/config.py -> 仓库根目录
ROOT_DIR = Path(__file__).resolve().parents[2]


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

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
