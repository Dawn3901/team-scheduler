"""CR-002 / CAL-9：个人日历 CRUD、隔离、范围、全天与团队忙闲脱敏。"""

from datetime import UTC, datetime, timedelta

import pytest

from app.security import create_access_token


@pytest.fixture()
def people(client, user_factory, team_factory, team_member_factory):
    owner = user_factory(username="owner")
    mate = user_factory(username="mate")
    outsider = user_factory(username="outsider")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=mate)

    def headers(user):
        return {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}

    return team, owner, mate, outsider, headers


def payload(**changes):
    start = datetime(2027, 3, 1, 1, 0, tzinfo=UTC)
    return {
        "title": "面试",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(),
        "location": "线上",
        "description": "个人事务",
        **changes,
    }


def test_owner_crud_and_refresh(client, people):
    team, owner, mate, outsider, headers = people
    created = client.post("/api/v1/me/events", json=payload(), headers=headers(owner))
    assert created.status_code == 201, created.text
    body = created.json()
    event_id = body["id"]
    assert body["share_busy"] is True
    assert body["title"] == "面试"

    listed = client.get(
        "/api/v1/me/calendar",
        params={"from": "2027-03-01T00:00:00Z", "to": "2027-03-08T00:00:00Z"},
        headers=headers(owner),
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    updated = client.patch(
        f"/api/v1/me/events/{event_id}",
        json={"title": "面试改期", "share_busy": False},
        headers=headers(owner),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "面试改期"
    assert updated.json()["share_busy"] is False

    assert client.delete(f"/api/v1/me/events/{event_id}", headers=headers(owner)).status_code == 204
    assert (
        client.get(
            "/api/v1/me/calendar",
            params={"from": "2027-03-01T00:00:00Z", "to": "2027-03-08T00:00:00Z"},
            headers=headers(owner),
        ).json()["total"]
        == 0
    )


def test_other_users_get_404_and_lists_are_isolated(client, people):
    team, owner, mate, outsider, headers = people
    event_id = client.post("/api/v1/me/events", json=payload(), headers=headers(owner)).json()["id"]

    # 没有单条个人事件 GET；他人 PATCH/DELETE 必须 404。
    assert client.get(f"/api/v1/me/events/{event_id}", headers=headers(mate)).status_code == 405
    assert (
        client.patch(
            f"/api/v1/me/events/{event_id}", json={"title": "偷改"}, headers=headers(mate)
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/me/events/{event_id}", headers=headers(mate)).status_code == 404

    mate_list = client.get(
        "/api/v1/me/calendar",
        params={"from": "2027-03-01T00:00:00Z", "to": "2027-03-08T00:00:00Z"},
        headers=headers(mate),
    )
    assert mate_list.json()["total"] == 0

    anonymous = client.get(
        "/api/v1/me/calendar",
        params={"from": "2027-03-01T00:00:00Z", "to": "2027-03-08T00:00:00Z"},
    )
    assert anonymous.status_code == 401


def test_range_and_time_validation(client, people):
    team, owner, mate, outsider, headers = people
    too_wide = client.get(
        "/api/v1/me/calendar",
        params={"from": "2027-01-01T00:00:00Z", "to": "2027-06-01T00:00:00Z"},
        headers=headers(owner),
    )
    assert too_wide.status_code == 422
    assert too_wide.json()["code"] == "INVALID_TIME_RANGE"

    missing_zone = client.post(
        "/api/v1/me/events",
        json={
            "title": "无时区",
            "start_at": "2027-03-01T09:00:00",
            "end_at": "2027-03-01T10:00:00",
        },
        headers=headers(owner),
    )
    assert missing_zone.status_code == 400

    reversed_times = client.post(
        "/api/v1/me/events",
        json=payload(end_at="2027-03-01T00:30:00Z"),
        headers=headers(owner),
    )
    assert reversed_times.status_code == 422

    bad_all_day = client.post(
        "/api/v1/me/events",
        json=payload(all_day=True),
        headers=headers(owner),
    )
    assert bad_all_day.status_code == 422


def test_all_day_uses_user_timezone(client, people):
    team, owner, mate, outsider, headers = people
    # 用户时区 Asia/Shanghai：本地 2027-03-01 00:00–次日 00:00 = UTC 02-28 16:00–03-01 16:00
    created = client.post(
        "/api/v1/me/events",
        json=payload(
            title="全天事务",
            all_day=True,
            start_at="2027-02-28T16:00:00Z",
            end_at="2027-03-01T16:00:00Z",
        ),
        headers=headers(owner),
    )
    assert created.status_code == 201, created.text
    assert created.json()["all_day"] is True


def test_team_busy_merges_personal_blocks_without_details(client, people):
    team, owner, mate, outsider, headers = people
    start = datetime(2027, 3, 2, 2, 0, tzinfo=UTC)
    personal_id = client.post(
        "/api/v1/me/events",
        json=payload(
            title="私事",
            start_at=start.isoformat(),
            end_at=(start + timedelta(hours=1)).isoformat(),
        ),
        headers=headers(owner),
    ).json()["id"]

    hidden = client.post(
        "/api/v1/me/events",
        json=payload(
            title="不共享",
            share_busy=False,
            start_at=(start + timedelta(hours=3)).isoformat(),
            end_at=(start + timedelta(hours=4)).isoformat(),
        ),
        headers=headers(owner),
    )
    assert hidden.status_code == 201

    availability = client.get(
        f"/api/v1/teams/{team.id}/availability",
        params={"from": "2027-03-02T00:00:00Z", "to": "2027-03-03T00:00:00Z"},
        headers=headers(mate),
    )
    assert availability.status_code == 200
    blocks = [
        block
        for member in availability.json()["members"]
        if member["user_id"] == owner.id
        for block in member["blocks"]
    ]
    personal_blocks = [b for b in blocks if b["event_id"] is None]
    assert len(personal_blocks) == 1
    assert personal_blocks[0]["title"] is None
    assert personal_blocks[0]["visibility"] == "private"
    assert personal_blocks[0]["busy"] is True
    assert personal_blocks[0]["start_at"] == "2027-03-02T02:00:00Z"
    assert personal_id > 0


def test_outsider_seeing_team_cannot_see_personal_busy(client, people):
    team, owner, mate, outsider, headers = people
    start = datetime(2027, 3, 3, 2, 0, tzinfo=UTC)
    client.post(
        "/api/v1/me/events",
        json=payload(start_at=start.isoformat(), end_at=(start + timedelta(hours=1)).isoformat()),
        headers=headers(owner),
    )
    assert (
        client.get(
            f"/api/v1/teams/{team.id}/availability",
            params={"from": "2027-03-03T00:00:00Z", "to": "2027-03-04T00:00:00Z"},
            headers=headers(outsider),
        ).status_code
        == 404
    )


def test_personal_events_absent_from_team_event_list(client, people):
    team, owner, mate, outsider, headers = people
    start = datetime(2027, 3, 4, 2, 0, tzinfo=UTC)
    client.post(
        "/api/v1/me/events",
        json=payload(start_at=start.isoformat(), end_at=(start + timedelta(hours=1)).isoformat()),
        headers=headers(owner),
    )
    events = client.get(
        f"/api/v1/teams/{team.id}/events",
        params={"from": "2027-03-04T00:00:00Z", "to": "2027-03-05T00:00:00Z"},
        headers=headers(mate),
    )
    assert events.json()["total"] == 0
