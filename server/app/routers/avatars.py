"""AUTH-8：上传/删除自己的头像，以及公开读取头像（带版本号）。

读取接口允许未登录访问（用户 2026-11-16 确认）：头像本身不是敏感数据，
`<img>` 标签无法附带 Bearer；路径带版本号，更新后缓存自然失效。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import CurrentUser, OptionalUser
from app.errors import ApiError
from app.models import User
from app.schemas import UserOut, avatar_url_for, avatar_version
from app.services import avatars

router = APIRouter(tags=["avatars"])

Db = Annotated[Session, Depends(get_db)]
MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def _out(user: User) -> UserOut:
    return UserOut.model_validate(user).model_copy(
        update={"avatar_url": avatar_url_for(user.id, user.avatar_file, user.avatar_updated_at)}
    )


def _version(user: User) -> int:
    """与 avatar_url_for 完全同源（毫秒 + UTC），避免读写两侧算出不同版本号。"""
    return avatar_version(user.avatar_updated_at)


@router.post("/auth/me/avatar", response_model=UserOut)
def upload_my_avatar(
    user: CurrentUser,
    db: Db,
    file: Annotated[UploadFile, File()],
) -> UserOut:
    data = file.file.read(avatars.MAX_AVATAR_BYTES + 1)
    updated = avatars.store_avatar(db, user, data, get_settings().avatar_path)
    return _out(updated)


@router.delete("/auth/me/avatar", response_model=UserOut)
def delete_my_avatar(user: CurrentUser, db: Db) -> UserOut:
    updated = avatars.clear_avatar(db, user, get_settings().avatar_path)
    return _out(updated)


# 版本号放路径而不是查询串：`<img>` 能用相对地址直接加载，
# 也没有“无令牌用户被 CORS 预检拦住”的问题。旧版本号一律 404，客户端会换 URL 重取。
@router.get("/users/{user_id}/avatar/{version}", include_in_schema=False)
def read_avatar(user_id: int, version: int, db: Db, viewer: OptionalUser) -> Response:
    """公开读取：未登录也可访问（`viewer` 仅解析令牌，不影响可见性）。"""
    del viewer
    user = db.get(User, user_id)
    path = avatars.avatar_path(get_settings().avatar_path, user.avatar_file if user else None)
    if path is None or (user is not None and version != _version(user)):
        raise ApiError(404, "NOT_FOUND", "头像不存在")
    media_type = MEDIA_TYPES[path.suffix.lstrip(".")]
    return Response(
        path.read_bytes(),
        media_type=media_type,
        headers={
            # 文件名含随机串，内容永不改动：允许长期缓存，换图后 URL 随版本号变化。
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
