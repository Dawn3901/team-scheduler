"""上传头像：只落服务器本地目录，数据库只存文件名（CR-015 / AUTH-8）。

- 允许 JPEG / PNG / WebP，按文件头魔数判断，不信任客户端 Content-Type；
- 单文件 ≤ 2 MB（与 BR-12 请求体上限一致）；
- 文件名由服务端生成（用户 id + 随机串），不接受用户输入，避免路径穿越；
- 新图写入成功后才替换旧文件并提交，失败不留半成品。
"""

from __future__ import annotations

import re
import secrets
from pathlib import Path

from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import User, now_utc

MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_EXTENSIONS = ("jpg", "png", "webp")


def sniff_image(data: bytes) -> str:
    """按魔数返回扩展名；不认识或不像图片时抛 415。"""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    raise ApiError(415, "INVALID_AVATAR", "头像只支持 JPEG、PNG 或 WebP 图片")


def store_avatar(db: Session, user: User, data: bytes, directory: Path) -> User:
    if not data:
        raise ApiError(422, "INVALID_AVATAR", "请选择要上传的图片")
    if len(data) > MAX_AVATAR_BYTES:
        raise ApiError(413, "AVATAR_TOO_LARGE", "头像不能超过 2 MB")
    # 先校验格式再清理旧图：非法上传不能把已有头像弄丢。
    extension = sniff_image(data)

    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{user.id}-{secrets.token_hex(8)}.{extension}"
    target = directory / filename
    target.write_bytes(data)

    previous = user.avatar_file
    user.avatar_file = filename
    user.avatar_updated_at = now_utc()
    try:
        db.commit()
    except Exception:
        db.rollback()
        target.unlink(missing_ok=True)
        raise
    _remove(directory, previous)
    return user


def clear_avatar(db: Session, user: User, directory: Path) -> User:
    previous = user.avatar_file
    user.avatar_file = None
    user.avatar_updated_at = None
    db.commit()
    _remove(directory, previous)
    return user


def avatar_url(user: User) -> str | None:
    from app.schemas import avatar_url_for

    return avatar_url_for(user.id, user.avatar_file, user.avatar_updated_at)


def avatar_path(directory: Path, filename: str | None) -> Path | None:
    """只接受服务端生成的文件名格式，任何其它输入都视为不存在。"""
    if not filename or not re.fullmatch(r"\d+-[0-9a-f]{16}\.(jpg|png|webp)", filename):
        return None
    path = (directory / filename).resolve()
    if directory.resolve() not in path.parents:
        return None
    return path if path.is_file() else None


def _remove(directory: Path, filename: str | None) -> None:
    path = avatar_path(directory, filename)
    if path is not None:
        path.unlink(missing_ok=True)
