"""CR-013：个人日历聚合议程的可见性、范围与任务口径。"""

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


def _window():
    start = datetime(2027, 5, 3, 0, 0, tzinfo=UTC)
    return start, start + timedelta(days=7)


def test_agenda_merges_personal_events_and_my_team_events(client, people):
    team, owner, mate, outsider, headers = people
    start, _ = _window()
    personal = client.post(
        "/api/v1/me/events",
        json={
            "title": "宿舍",
            "start_at": (start + timedelta(hours=5)).isoformat(),
            "end_at": (start + timedelta(hours=6)).isoformat(),
        },
        headers=headers(owner),
    )
    assert personal.status_code == 201, personal.text

    event = client.post(
        f"/api/v1/teams/{team.id}/events",
        json={
            "title": "周会",
            "start_at": (start + timedelta(hours=1)).isoformat(),
            "end_at": (start + timedelta(hours=2)).isoformat(),
            "participant_ids": [owner.id, mate.id],
        },
        headers=headers(owner),
    )
    assert event.status_code == 201, event.text

    result = client.get(
        "/api/v1/me/agenda",
        params={"from": start.isoformat(), "to": (start + timedelta(days=7)).isoformat()},
        headers=headers(owner),
    )
    assert result.status_code == 200, result.text
    body = result.json()
    kinds = {item["kind"]: item for item in body["events"]}
    assert kinds["team_event"]["title"] == "周会"
    assert kinds["team_event"]["my_response"] == "accepted"
    assert kinds["team_event"]["team_name"]
    assert kinds["personal"]["title"] == "宿舍"
    assert kinds["personal"]["team_id"] is None
    assert body["tasks"] == []


def test_agenda_excludes_declined_and_non_members(client, people):
    team, owner, mate, outsider, headers = people
    start, _ = _window()
    created = client.post(
        f"/api/v1/teams/{team.id}/events",
        json={
            "title": "评审",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
            "participant_ids": [owner.id, mate.id],
        },
        headers=headers(owner),
    )
    event_id = created.json()["id"]
    declined = client.patch(
        f"/api/v1/events/{event_id}/rsvp", json={"response": "declined"}, headers=headers(mate)
    )
    assert declined.status_code == 200

    mate_body = client.get(
        "/api/v1/me/agenda",
        params={"from": start.isoformat(), "to": (start + timedelta(days=7)).isoformat()},
        headers=headers(mate),
    ).json()
    assert mate_body["events"] == []

    outsider_agenda = client.get(
        "/api/v1/me/agenda",
        params={"from": start.isoformat(), "to": (start + timedelta(days=7)).isoformat()},
        headers=headers(outsider),
    )
    assert outsider_agenda.status_code == 200
    assert outsider_agenda.json()["events"] == []


def test_agenda_includes_my_overdue_tasks(client, people):
    team, owner, mate, outsider, headers = people
    start, _ = _window()
    task = client.post(
        f"/api/v1/teams/{team.id}/tasks",
        json={
            "title": "补交报告",
            "assignee_id": owner.id,
            "due_at": "2026-01-01T02:00:00Z",
            "priority": "high",
        },
        headers=headers(owner),
    )
    assert task.status_code == 201, task.text

    body = client.get(
        "/api/v1/me/agenda",
        params={"from": start.isoformat(), "to": (start + timedelta(days=7)).isoformat()},
        headers=headers(owner),
    ).json()
    assert [t["title"] for t in body["tasks"]] == ["补交报告"]
    assert body["tasks"][0]["overdue"] is True


def test_agenda_validates_range_and_requires_auth(client, people):
    team, owner, mate, outsider, headers = people
    too_wide = client.get(
        "/api/v1/me/agenda",
        params={"from": "2027-01-01T00:00:00Z", "to": "2027-06-01T00:00:00Z"},
        headers=headers(owner),
    )
    assert too_wide.status_code == 422
    assert too_wide.json()["code"] == "INVALID_TIME_RANGE"

    anonymous = client.get(
        "/api/v1/me/agenda",
        params={"from": "2027-05-03T00:00:00Z", "to": "2027-05-10T00:00:00Z"},
    )
    assert anonymous.status_code == 401

    naive = client.get(
        "/api/v1/me/agenda",
        params={"from": "2027-05-03T00:00:00", "to": "2027-05-10T00:00:00"},
        headers=headers(owner),
    )
    assert naive.status_code == 400
