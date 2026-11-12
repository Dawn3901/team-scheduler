"""W1-10：P0 HTTP API 契约冻结测试。

冻结内容：路径/方法、统一错误码、分页、时间格式，以及 docs/03 §5 的端点/错误码表。
任何变更都必须走 CR，并同时更新 docs/03、docs/ai/02 与本文件的冻结常量。
"""

from __future__ import annotations

import ast
import re
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.errors import HTTP_ERROR_CODES
from app.main import app
from app.models import Team, User
from app.security import create_access_token

ROOT = Path(__file__).resolve().parents[2]
DESIGN_DOC = ROOT / "docs" / "03-概要设计说明书.md"

# 冻结基线：CR-009 35 个 + CR-002 个人日历 4 个 + CR-011 活动视图 1 个，共 40 个（含 /health）。
FROZEN_OPERATIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("GET", "/health"),
        ("POST", "/api/v1/auth/register"),
        ("POST", "/api/v1/auth/login"),
        ("GET", "/api/v1/auth/me"),
        ("PATCH", "/api/v1/auth/me"),
        ("GET", "/api/v1/teams"),
        ("POST", "/api/v1/teams"),
        ("POST", "/api/v1/teams/join"),
        ("GET", "/api/v1/teams/{team_id}"),
        ("DELETE", "/api/v1/teams/{team_id}"),
        ("GET", "/api/v1/teams/{team_id}/members"),
        ("PATCH", "/api/v1/teams/{team_id}/members/{user_id}"),
        ("DELETE", "/api/v1/teams/{team_id}/members/{user_id}"),
        ("POST", "/api/v1/teams/{team_id}/leave"),
        ("POST", "/api/v1/teams/{team_id}/invite-code/rotate"),
        ("GET", "/api/v1/teams/{team_id}/events"),
        ("POST", "/api/v1/teams/{team_id}/events"),
        ("GET", "/api/v1/events/{event_id}"),
        ("PATCH", "/api/v1/events/{event_id}"),
        ("DELETE", "/api/v1/events/{event_id}"),
        ("POST", "/api/v1/events/{event_id}/participants"),
        ("DELETE", "/api/v1/events/{event_id}/participants/{user_id}"),
        ("PATCH", "/api/v1/events/{event_id}/rsvp"),
        ("GET", "/api/v1/teams/{team_id}/availability"),
        ("GET", "/api/v1/teams/{team_id}/availability/suggestions"),
        ("GET", "/api/v1/teams/{team_id}/tasks/dependency-graph"),
        ("GET", "/api/v1/teams/{team_id}/tasks"),
        ("POST", "/api/v1/teams/{team_id}/tasks"),
        ("PATCH", "/api/v1/tasks/{task_id}"),
        ("DELETE", "/api/v1/tasks/{task_id}"),
        ("POST", "/api/v1/tasks/{task_id}/complete"),
        ("POST", "/api/v1/tasks/{task_id}/reopen"),
        ("GET", "/api/v1/notifications"),
        ("POST", "/api/v1/notifications/read-all"),
        ("POST", "/api/v1/notifications/{notification_id}/read"),
        ("GET", "/api/v1/me/calendar"),
        ("POST", "/api/v1/me/events"),
        ("PATCH", "/api/v1/me/events/{event_id}"),
        ("DELETE", "/api/v1/me/events/{event_id}"),
        ("GET", "/api/v1/me/team-events"),
    }
)

# 框架兜底映射（app/errors.py）。429 是 AUTH-7 P1 预留，当前不主动返回。
FROZEN_HTTP_ERROR_CODES = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
}

# 业务错误码；与 docs/03 §5.8 表格逐项一致。
FROZEN_ERROR_CODES = frozenset(FROZEN_HTTP_ERROR_CODES.values()) | {
    "INVALID_CREDENTIALS",
    "USERNAME_TAKEN",
    "INVITE_CODE_INVALID",
    "TIME_CONFLICT",
    "EVENT_CANCELLED",
    "EVENT_ENDED",
    "INVALID_PASSWORD",
    "INVALID_TIME_RANGE",
    "EVENT_ALREADY_STARTED",
    "INVALID_PARTICIPANT",
    "INVALID_ASSIGNEE",
    "ORGANIZER_CANNOT_DECLINE",
    "INVALID_RECURRENCE",
    "INVALID_DEPENDENCY",
    "DEPENDENCY_CYCLE",
    "TASK_BLOCKED",
    "DEPENDENCY_IN_USE",
}

# 由 validate_ids 以变量形式抛出的两个业务码。
VARIABLE_CODES = {"INVALID_PARTICIPANT", "INVALID_ASSIGNEE"}

PAGINATED_PATHS = [
    "/api/v1/teams",
    "/api/v1/teams/{team_id}/members",
    "/api/v1/teams/{team_id}/events",
    "/api/v1/teams/{team_id}/tasks",
    "/api/v1/notifications",
]

TIMESTAMP_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{6})?Z$")
ROW_RE = re.compile(
    r"^\|\s*\d+\s*\|\s*(GET|POST|PATCH|DELETE)\s*\|\s*`([^`]+)`", re.MULTILINE
)
ERROR_ROW_RE = re.compile(r"^\|\s*(\d{3})\s*\|\s*`([A-Z_]+)`", re.MULTILINE)


def _documented_operations() -> set[tuple[str, str]]:
    text = DESIGN_DOC.read_text(encoding="utf-8")
    block = text.split("<!-- api-contract:start -->", 1)[1].split(
        "<!-- api-contract:end -->", 1
    )[0]
    operations = set()
    for method, path in ROW_RE.findall(block):
        operations.add((method, "/health" if path == "/health" else f"/api/v1{path}"))
    return operations


def _documented_error_codes() -> set[str]:
    text = DESIGN_DOC.read_text(encoding="utf-8")
    block = text.split("<!-- api-contract:error-start -->", 1)[1].split(
        "<!-- api-contract:error-end -->", 1
    )[0]
    return {code for _, code in ERROR_ROW_RE.findall(block)}


def _source_api_error_codes() -> set[str]:
    codes: set[str] = set()
    for path in (ROOT / "server" / "app").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "ApiError"
            ):
                continue
            if (
                len(node.args) >= 2
                and isinstance(node.args[1], ast.Constant)
                and isinstance(node.args[1].value, str)
            ):
                codes.add(node.args[1].value)
    return codes


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}


def _assert_error_envelope(response, status: int, code: str) -> dict:
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"code", "message", "details"}
    assert body["code"] == code, body
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["details"], dict)
    return body


def test_frozen_operation_set_matches_openapi() -> None:
    spec = app.openapi()
    actual = {
        (method.upper(), path)
        for path, operations in spec["paths"].items()
        for method in operations
        if method.upper() in {"GET", "POST", "PATCH", "DELETE"}
    }
    assert actual == set(FROZEN_OPERATIONS)
    assert len(actual) == 40


def test_documented_endpoint_table_matches_frozen_contract() -> None:
    assert _documented_operations() == set(FROZEN_OPERATIONS)


def test_documented_error_codes_match_frozen_contract() -> None:
    assert _documented_error_codes() == set(FROZEN_ERROR_CODES)
    assert HTTP_ERROR_CODES == FROZEN_HTTP_ERROR_CODES


def test_source_does_not_introduce_undocumented_error_codes() -> None:
    source_codes = _source_api_error_codes()
    assert source_codes <= FROZEN_ERROR_CODES
    business_codes = FROZEN_ERROR_CODES - set(FROZEN_HTTP_ERROR_CODES.values())
    # 双向校验：源码用到的具体业务码都已冻结，冻结表里也没有过期/未使用的业务码。
    assert (source_codes - set(FROZEN_HTTP_ERROR_CODES.values())) | VARIABLE_CODES == business_codes


def test_list_endpoints_freeze_pagination_parameters() -> None:
    spec = app.openapi()
    for path in PAGINATED_PATHS:
        params = {
            parameter["name"]: parameter
            for parameter in spec["paths"][path]["get"].get("parameters", [])
        }
        limit = params["limit"]["schema"]
        offset = params["offset"]["schema"]
        assert limit["default"] == 20 and limit["minimum"] == 1 and limit["maximum"] == 100
        assert offset["default"] == 0 and offset["minimum"] == 0


def test_pagination_rejects_out_of_range_with_unified_error(
    client: TestClient,
    user_factory: Callable[..., User],
) -> None:
    user = user_factory(username="contract_page_user")
    for query in ("limit=101", "limit=0", "offset=-1"):
        _assert_error_envelope(
            client.get(f"/api/v1/teams?{query}", headers=_headers(user)),
            400,
            "VALIDATION_ERROR",
        )


def test_error_envelope_and_authorization_invariants(
    client: TestClient,
    user_factory: Callable[..., User],
    team_factory: Callable[..., Team],
    team_member_factory: Callable[..., object],
) -> None:
    owner = user_factory(username="contract_owner")
    member = user_factory(username="contract_member")
    outsider = user_factory(username="contract_outsider")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=member, role="member")
    owner_headers = _headers(owner)
    member_headers = _headers(member)

    unauthorized = client.get("/api/v1/teams")
    _assert_error_envelope(unauthorized, 401, "UNAUTHORIZED")
    assert unauthorized.headers["www-authenticate"] == "Bearer"

    _assert_error_envelope(
        client.get(f"/api/v1/teams/{team.id}", headers=_headers(outsider)),
        404,
        "NOT_FOUND",
    )
    _assert_error_envelope(
        client.delete(f"/api/v1/teams/{team.id}", headers=member_headers),
        403,
        "FORBIDDEN",
    )
    _assert_error_envelope(
        client.post(
            "/api/v1/teams/join",
            json={"invite_code": "ZZZZZZZZ"},
            headers=owner_headers,
        ),
        409,
        "INVITE_CODE_INVALID",
    )
    _assert_error_envelope(
        client.post(
            f"/api/v1/teams/{team.id}/events",
            json={
                "title": "非法时间",
                "start_at": "2030-01-02T10:00:00+08:00",
                "end_at": "2030-01-02T09:00:00+08:00",
            },
            headers=owner_headers,
        ),
        422,
        "INVALID_TIME_RANGE",
    )
    _assert_error_envelope(
        client.get("/api/v1/teams?limit=101", headers=owner_headers),
        400,
        "VALIDATION_ERROR",
    )


def test_event_timestamps_are_utc_with_z_suffix(
    client: TestClient,
    user_factory: Callable[..., User],
    team_factory: Callable[..., Team],
) -> None:
    owner = user_factory(username="contract_time_owner")
    team = team_factory(owner=owner)
    response = client.post(
        f"/api/v1/teams/{team.id}/events",
        json={
            "title": "时区契约",
            "start_at": "2030-01-02T09:00:00+08:00",
            "end_at": "2030-01-02T10:00:00+08:00",
        },
        headers=_headers(owner),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["start_at"] == "2030-01-02T01:00:00Z"
    assert body["end_at"] == "2030-01-02T02:00:00Z"
    assert TIMESTAMP_RE.match(body["start_at"])
    assert TIMESTAMP_RE.match(body["updated_at"])


@pytest.mark.parametrize("raw", ["2030-01-02T09:00:00", "2030-01-02"])
def test_event_timestamp_without_timezone_is_400(
    client: TestClient,
    user_factory: Callable[..., User],
    team_factory: Callable[..., Team],
    raw: str,
) -> None:
    owner = user_factory(username=f"contract_naive_{abs(hash(raw))}")
    team = team_factory(owner=owner)
    _assert_error_envelope(
        client.post(
            f"/api/v1/teams/{team.id}/events",
            json={
                "title": "无时区",
                "start_at": raw,
                "end_at": "2030-01-02T10:00:00+08:00",
            },
            headers=_headers(owner),
        ),
        400,
        "VALIDATION_ERROR",
    )
