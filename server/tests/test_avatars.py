"""AUTH-8：用户上传头像（CR-015）。"""

from pathlib import Path

import pytest

from app.config import get_settings
from app.security import create_access_token

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000000020001e221bc330000000049454e44ae426082"
)


@pytest.fixture()
def avatar_dir(tmp_path: Path, monkeypatch) -> Path:
    settings = get_settings()
    monkeypatch.setattr(settings, "avatar_dir", str(tmp_path / "avatars"))
    return tmp_path / "avatars"


@pytest.fixture()
def user_and_headers(user_factory):
    user = user_factory(username="avatar_user")
    headers = {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}
    return user, headers


def upload(client, headers, data: bytes, filename="me.png", content_type="image/png"):
    return client.post(
        "/api/v1/auth/me/avatar",
        files={"file": (filename, data, content_type)},
        headers=headers,
    )


def test_upload_returns_url_and_serves_image_without_login(client, avatar_dir, user_and_headers):
    user, headers = user_and_headers
    assert client.get("/api/v1/auth/me", headers=headers).json()["avatar_url"] is None

    result = upload(client, headers, PNG_1PX)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["avatar_url"].startswith(f"/api/v1/users/{user.id}/avatar/")
    assert len(list(avatar_dir.iterdir())) == 1

    # 公开读取：不带 Authorization 也能拿到图片。
    image = client.get(body["avatar_url"])
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.content == PNG_1PX
    assert "immutable" in image.headers["cache-control"]
    assert image.headers["x-content-type-options"] == "nosniff"


def test_team_members_include_avatar_url(client, db, avatar_dir, user_and_headers):
    from tests.factories import create_team

    user, headers = user_and_headers
    # create_team 已把 owner 写入成员表，不要再重复插入。
    team = create_team(db, owner=user)
    before = client.get(f"/api/v1/teams/{team.id}/members", headers=headers).json()["items"]
    assert before[0]["avatar_url"] is None

    upload(client, headers, PNG_1PX)
    after = client.get(f"/api/v1/teams/{team.id}/members", headers=headers).json()["items"]
    assert after[0]["avatar_url"].startswith(f"/api/v1/users/{user.id}/avatar/")


def test_reupload_replaces_old_file(client, avatar_dir, user_and_headers):
    _, headers = user_and_headers
    first = upload(client, headers, PNG_1PX).json()["avatar_url"]
    second = upload(client, headers, PNG_1PX).json()["avatar_url"]
    assert len(list(avatar_dir.iterdir())) == 1
    assert first != second
    # 旧版本地址失效，避免浏览器继续展示换掉的头像。
    assert client.get(first).status_code == 404
    assert client.get(second).status_code == 200


def test_delete_restores_initial_fallback(client, avatar_dir, user_and_headers):
    _, headers = user_and_headers
    url = upload(client, headers, PNG_1PX).json()["avatar_url"]
    removed = client.delete("/api/v1/auth/me/avatar", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["avatar_url"] is None
    assert not avatar_dir.exists() or not list(avatar_dir.iterdir())
    assert client.get(url).status_code == 404


@pytest.mark.parametrize(
    ("data", "content_type"),
    [
        (b"<html>not an image</html>", "image/png"),
        (b"GIF89a" + b"\x00" * 32, "image/gif"),
    ],
)
def test_rejects_non_jpeg_png_webp_by_magic_bytes(
    client, avatar_dir, user_and_headers, data, content_type
):
    _, headers = user_and_headers
    result = upload(client, headers, data, content_type=content_type)
    assert result.status_code == 415
    assert result.json()["code"] == "INVALID_AVATAR"
    assert not avatar_dir.exists() or not list(avatar_dir.iterdir())


def test_rejects_oversized_image(client, avatar_dir, user_and_headers):
    _, headers = user_and_headers
    oversized = PNG_1PX + b"\x00" * (2 * 1024 * 1024)
    result = upload(client, headers, oversized)
    assert result.status_code == 413
    assert result.json()["code"] == "AVATAR_TOO_LARGE"


def test_requires_login_and_cannot_target_others(
    client, avatar_dir, user_and_headers, user_factory
):
    other = user_factory(username="other")
    assert upload(client, {}, PNG_1PX).status_code == 401
    # 只允许改自己的头像：没有“指定 user_id 上传”的入口。
    guarded = client.post(
        f"/api/v1/users/{other.id}/avatar",
        files={"file": ("a.png", PNG_1PX, "image/png")},
    )
    assert guarded.status_code in (404, 405)
