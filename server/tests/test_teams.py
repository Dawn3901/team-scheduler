"""W1-06 团队接口测试（TEAM-1..4, 8）。"""

import re
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Team, TeamMember
from app.security import create_access_token

PASSWORD = "correct-horse"
INVITE_CODE_PATTERN = re.compile(r"^[A-Z0-9]{8}$")


def _register(client: TestClient, username: str = "lin", display_name: str = "林"):
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "display_name": display_name, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["user"]["id"], {"Authorization": f"Bearer {body['access_token']}"}


def _headers_for(user_id: int, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id, username)}"}


def _create_team(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str = "软工大作业",
    description: str | None = None,
):
    payload: dict[str, object] = {"name": name}
    if description is not None:
        payload["description"] = description
    return client.post("/api/v1/teams", json=payload, headers=headers)


def _join(client: TestClient, headers: dict[str, str], invite_code: str):
    return client.post(
        "/api/v1/teams/join", json={"invite_code": invite_code}, headers=headers
    )


def test_create_team_returns_201_owner_and_invite_code(
    client: TestClient, db: Session
) -> None:
    owner_id, headers = _register(client)

    response = _create_team(client, headers, description="6 周项目")

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
        "id",
        "name",
        "description",
        "invite_code",
        "owner_id",
        "timezone",
        "my_role",
        "member_count",
    }
    assert body["name"] == "软工大作业"
    assert body["description"] == "6 周项目"
    assert body["owner_id"] == owner_id
    assert body["timezone"] == "Asia/Shanghai"
    assert body["my_role"] == "owner"
    assert body["member_count"] == 1
    assert INVITE_CODE_PATTERN.fullmatch(body["invite_code"])
    assert "password" not in response.text

    team = db.get(Team, body["id"])
    assert team is not None
    assert team.deleted_at is None
    members = db.scalars(
        select(TeamMember).where(TeamMember.team_id == team.id)
    ).all()
    assert len(members) == 1
    assert members[0].user_id == owner_id
    assert members[0].role == "owner"
    assert members[0].status == "active"


def test_create_team_trims_and_rejects_invalid_name(
    client: TestClient, db: Session
) -> None:
    _, headers = _register(client)

    trimmed = _create_team(client, headers, name="  产品组  ")
    assert trimmed.status_code == 201
    assert trimmed.json()["name"] == "产品组"

    for name in ("", "   ", "名" * 51):
        response = _create_team(client, headers, name=name)
        assert response.status_code == 422
        assert response.json()["code"] == "UNPROCESSABLE_ENTITY"

    assert db.scalar(select(func.count()).select_from(Team)) == 1


def test_create_team_rejects_too_long_description(client: TestClient) -> None:
    _, headers = _register(client)

    response = _create_team(client, headers, description="x" * 2001)

    assert response.status_code == 422
    assert response.json()["code"] == "UNPROCESSABLE_ENTITY"


def test_team_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/api/v1/teams").status_code == 401
    assert client.post("/api/v1/teams", json={"name": "x"}).status_code == 401
    assert client.post("/api/v1/teams/join", json={"invite_code": "ABC"}).status_code == 401
    assert client.get("/api/v1/teams/1").status_code == 401
    assert client.get("/api/v1/teams/1/members").status_code == 401


def test_join_team_with_invite_code(client: TestClient, db: Session) -> None:
    _, owner_headers = _register(client, "owner", "林")
    member_id, member_headers = _register(client, "member", "陈")
    team = _create_team(client, owner_headers).json()

    response = _join(client, member_headers, team["invite_code"])

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == team["id"]
    assert body["my_role"] == "member"
    assert body["member_count"] == 2

    membership = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == team["id"], TeamMember.user_id == member_id
        )
    )
    assert membership is not None
    assert membership.role == "member"
    assert membership.status == "active"


def test_join_team_is_idempotent(client: TestClient, db: Session) -> None:
    _, owner_headers = _register(client, "owner")
    member_id, member_headers = _register(client, "member")
    team = _create_team(client, owner_headers).json()

    assert _join(client, member_headers, team["invite_code"]).status_code == 200
    second = _join(client, member_headers, team["invite_code"])

    assert second.status_code == 200
    assert second.json()["my_role"] == "member"
    assert second.json()["member_count"] == 2
    count = db.scalar(
        select(func.count())
        .select_from(TeamMember)
        .where(TeamMember.team_id == team["id"], TeamMember.user_id == member_id)
    )
    assert count == 1


def test_join_with_invalid_code_is_409(client: TestClient, db: Session) -> None:
    _, headers = _register(client, "member")

    response = _join(client, headers, "NOPE1234")

    assert response.status_code == 409
    assert response.json()["code"] == "INVITE_CODE_INVALID"
    assert db.scalar(select(func.count()).select_from(TeamMember)) == 0


def test_join_deleted_team_code_is_invalid(client: TestClient, db: Session) -> None:
    _, owner_headers = _register(client, "owner")
    _, member_headers = _register(client, "member")
    team = _create_team(client, owner_headers).json()
    db_team = db.get(Team, team["id"])
    db_team.deleted_at = datetime.now(UTC)
    db.commit()

    response = _join(client, member_headers, team["invite_code"])

    assert response.status_code == 409
    assert response.json()["code"] == "INVITE_CODE_INVALID"


def test_join_reactivates_left_member(client: TestClient, db: Session) -> None:
    _, owner_headers = _register(client, "owner")
    member_id, member_headers = _register(client, "member")
    team = _create_team(client, owner_headers).json()
    _join(client, member_headers, team["invite_code"])

    membership = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == team["id"], TeamMember.user_id == member_id
        )
    )
    membership.status = "left"
    db.commit()

    response = _join(client, member_headers, team["invite_code"])

    assert response.status_code == 200
    db.refresh(membership)
    assert membership.status == "active"


def test_list_teams_returns_only_my_active_teams(client: TestClient) -> None:
    _, alice_headers = _register(client, "alice")
    _, bob_headers = _register(client, "bob")
    alice_team = _create_team(client, alice_headers, name="A 队").json()
    bob_team = _create_team(client, bob_headers, name="B 队").json()
    _join(client, bob_headers, alice_team["invite_code"])

    alice_body = client.get("/api/v1/teams", headers=alice_headers).json()
    assert alice_body["total"] == 1
    assert [team["id"] for team in alice_body["items"]] == [alice_team["id"]]
    assert alice_body["items"][0]["my_role"] == "owner"

    bob_body = client.get("/api/v1/teams", headers=bob_headers).json()
    assert bob_body["total"] == 2
    roles = {team["id"]: team["my_role"] for team in bob_body["items"]}
    assert roles == {alice_team["id"]: "member", bob_team["id"]: "owner"}
    counts = {team["id"]: team["member_count"] for team in bob_body["items"]}
    assert counts[alice_team["id"]] == 2
    assert counts[bob_team["id"]] == 1


def test_list_teams_excludes_deleted_and_left(client: TestClient, db: Session) -> None:
    alice_id, alice_headers = _register(client, "alice")
    deleted_team = _create_team(client, alice_headers, name="已删除").json()
    left_team = _create_team(client, alice_headers, name="已退出").json()
    kept_team = _create_team(client, alice_headers, name="保留").json()

    db.get(Team, deleted_team["id"]).deleted_at = datetime.now(UTC)
    membership = db.scalar(
        select(TeamMember).where(
            TeamMember.team_id == left_team["id"], TeamMember.user_id == alice_id
        )
    )
    membership.status = "left"
    db.commit()

    body = client.get("/api/v1/teams", headers=alice_headers).json()

    assert body["total"] == 1
    assert [team["id"] for team in body["items"]] == [kept_team["id"]]


def test_team_detail_requires_membership(client: TestClient) -> None:
    _, alice_headers = _register(client, "alice")
    _, bob_headers = _register(client, "bob")
    team = _create_team(client, alice_headers).json()

    response = client.get(f"/api/v1/teams/{team['id']}", headers=bob_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert client.get(f"/api/v1/teams/{team['id']}", headers=alice_headers).status_code == 200
    assert client.get("/api/v1/teams/999999", headers=alice_headers).status_code == 404


def test_team_detail_shows_role_and_invite_code_to_member(client: TestClient) -> None:
    _, owner_headers = _register(client, "owner")
    _, member_headers = _register(client, "member")
    team = _create_team(client, owner_headers).json()
    _join(client, member_headers, team["invite_code"])

    response = client.get(f"/api/v1/teams/{team['id']}", headers=member_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["my_role"] == "member"
    assert body["member_count"] == 2
    assert body["invite_code"] == team["invite_code"]


def test_members_list_sorted_by_role_and_contract_fields(
    client: TestClient, user_factory, team_factory, team_member_factory
) -> None:
    owner = user_factory(username="owner", display_name="Owner 林")
    admin = user_factory(username="admin", display_name="Admin 陈")
    member = user_factory(username="member", display_name="Member 王")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=admin, role="admin")
    team_member_factory(team=team, user=member, role="member")

    response = client.get(
        f"/api/v1/teams/{team.id}/members", headers=_headers_for(owner.id, owner.username)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert [item["user_id"] for item in body["items"]] == [owner.id, admin.id, member.id]
    assert [item["role"] for item in body["items"]] == ["owner", "admin", "member"]
    assert body["items"][0]["display_name"] == "Owner 林"
    for item in body["items"]:
        assert set(item) == {"user_id", "display_name", "role", "joined_at"}
        joined_at = item["joined_at"]
        assert joined_at.endswith("Z")
        parsed = datetime.fromisoformat(joined_at.replace("Z", "+00:00"))
        assert parsed.tzinfo is not None


def test_members_list_paginates_with_total(
    client: TestClient, user_factory, team_factory, team_member_factory
) -> None:
    owner = user_factory(username="owner")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=user_factory(username="admin"), role="admin")
    team_member_factory(team=team, user=user_factory(username="member"), role="member")

    response = client.get(
        f"/api/v1/teams/{team.id}/members?limit=1&offset=1",
        headers=_headers_for(owner.id, owner.username),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 1
    assert body["items"][0]["role"] == "admin"


def test_members_list_requires_membership(client: TestClient) -> None:
    _, alice_headers = _register(client, "alice")
    _, bob_headers = _register(client, "bob")
    team = _create_team(client, alice_headers).json()

    response = client.get(f"/api/v1/teams/{team['id']}/members", headers=bob_headers)

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"


def test_members_are_isolated_per_team(client: TestClient) -> None:
    _, alice_headers = _register(client, "alice")
    _, bob_headers = _register(client, "bob")
    _, carol_headers = _register(client, "carol")
    first = _create_team(client, alice_headers, name="A 队").json()
    second = _create_team(client, alice_headers, name="B 队").json()
    _join(client, bob_headers, first["invite_code"])
    _join(client, carol_headers, second["invite_code"])

    first_members = client.get(
        f"/api/v1/teams/{first['id']}/members", headers=alice_headers
    ).json()
    second_members = client.get(
        f"/api/v1/teams/{second['id']}/members", headers=alice_headers
    ).json()

    assert first_members["total"] == 2
    assert second_members["total"] == 2
    first_ids = {item["user_id"] for item in first_members["items"]}
    second_ids = {item["user_id"] for item in second_members["items"]}
    assert first_ids != second_ids


def test_invite_codes_are_unique(client: TestClient) -> None:
    _, headers = _register(client, "owner")

    codes = {
        _create_team(client, headers, name=f"团队 {index}").json()["invite_code"]
        for index in range(5)
    }

    assert len(codes) == 5
