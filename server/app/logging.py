"""日志配置：让 LOG_LEVEL 真正生效。"""

import logging

DEFAULT_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging(level: str) -> int:
    """按配置设置 root 与 app logger 级别，返回解析后的 logging 常量。"""
    resolved = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(level=resolved, format=DEFAULT_FORMAT)
    logging.getLogger().setLevel(resolved)
    logging.getLogger("app").setLevel(resolved)
    return resolved
