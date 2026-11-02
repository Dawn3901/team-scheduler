"""P0 主流程及权限/脱敏/时间/去重回归；不 mock 核心业务。"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Event, Notification, Task
from app.scheduler.reminders import scan_reminders
from app.security import create_access_token


@pytest.fixture()
def actors(client, user_factory, team_factory, team_member_factory):
    owner = user_factory(username="owner")
    member = user_factory(username="member")
    other = user_factory(username="other")
    outsider = user_factory(username="outsider")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=member)
    team_member_factory(team=team, user=other)

    def headers(user):
        return {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}

    return team, owner, member, other, outsider, headers


def event_data(uid, **changes):
    start = datetime.now(UTC) + timedelta(days=2)
    return {
        "title": "评审",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(),
        "participant_ids": [uid],
        **changes,
    }


def test_invite_rsvp_conflict_and_privacy(client, actors):
    team, owner, member, other, outsider, headers = actors
    path = f"/api/v1/teams/{team.id}"
    payload = event_data(
        member.id,
        title="私密医疗事项",
        location="秘密地点",
        description="秘密描述",
        visibility="private",
    )
    result = client.post(path + "/events", json=payload, headers=headers(owner))
    assert result.status_code == 201, result.text
    event = result.json()
    assert event["my_response"] == "accepted"
    eid = event["id"]
    assert client.get(f"/api/v1/events/{eid}", headers=headers(other)).status_code == 404
    assert client.get(f"/api/v1/events/{eid}", headers=headers(outsider)).status_code == 404
    query = {"from": payload["start_at"], "to": payload["end_at"]}
    visible = client.get(path + "/events", params=query, headers=headers(other))
    assert visible.json()["total"] == 0
    busy = client.get(path + "/availability", params=query, headers=headers(other))
    assert busy.status_code == 200
    assert "私密医疗事项" not in busy.text and "秘密" not in busy.text
    block = busy.json()["members"][0]["blocks"][0]
    assert block["event_id"] is None and block["title"] is None
    assert "location" not in block and "description" not in block
    conflicting = client.post(path + "/events", json=payload, headers=headers(other))
    assert conflicting.status_code == 409, conflicting.text
    assert conflicting.json()["code"] == "TIME_CONFLICT"
    assert "私密医疗事项" not in conflicting.text
    assert (
        client.patch(
            f"/api/v1/events/{eid}/rsvp", json={"response": "accepted"}, headers=headers(member)
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/v1/events/{eid}/rsvp", json={"response": "declined"}, headers=headers(owner)
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/v1/events/{eid}/rsvp", json={"response": "declined"}, headers=headers(member)
        ).status_code
        == 200
    )
    # 仅拒绝者与新组织者参与，原组织者不在新邀请里，因此不再冲突。
    assert client.post(path + "/events", json=payload, headers=headers(other)).status_code == 201
    notice = client.get("/api/v1/notifications", headers=headers(member)).json()
    assert notice["unread_count"] == 2
    nid = notice["items"][0]["id"]
    assert (
        client.post(f"/api/v1/notifications/{nid}/read", headers=headers(other)).status_code == 404
    )
    assert client.post("/api/v1/notifications/read-all", headers=headers(member)).status_code == 204
    assert client.get("/api/v1/notifications", headers=headers(member)).json()["unread_count"] == 0


def test_event_edit_excludes_self_force_cancel_and_delete(client, actors):
    team, owner, member, other, outsider, headers = actors
    path = f"/api/v1/teams/{team.id}/events"
    payload = event_data(member.id)
    event = client.post(path, json=payload, headers=headers(owner)).json()
    resource = f"/api/v1/events/{event['id']}"
    assert (
        client.patch(resource, json={"title": "新标题"}, headers=headers(member)).status_code == 403
    )
    assert (
        client.patch(resource, json={"title": "新标题"}, headers=headers(owner)).status_code == 200
    )
    assert (
        client.patch(
            resource, json={"start_at": payload["start_at"]}, headers=headers(owner)
        ).status_code
        == 200
    )
    duplicate = client.post(
        path, json={**payload, "ignore_conflicts": True}, headers=headers(owner)
    )
    assert duplicate.status_code == 201
    assert (
        client.post(
            resource + "/participants",
            json={"user_ids": [member.id, member.id]},
            headers=headers(owner),
        ).json()["total"]
        == 2
    )
    assert (
        client.post(
            resource + "/participants", json={"user_ids": [outsider.id]}, headers=headers(owner)
        ).status_code
        == 422
    )
    assert (
        client.delete(resource + f"/participants/{member.id}", headers=headers(owner)).status_code
        == 204
    )
    assert (
        client.patch(resource, json={"status": "cancelled"}, headers=headers(owner)).status_code
        == 200
    )
    assert (
        client.patch(
            resource + "/rsvp", json={"response": "accepted"}, headers=headers(member)
        ).json()["code"]
        == "EVENT_CANCELLED"
    )
    assert client.delete(resource, headers=headers(owner)).status_code == 204
    assert client.get(resource, headers=headers(owner)).status_code == 404


def test_tasks_permissions_filters_complete_reopen_remove_cleanup(client, actors, db):
    team, owner, member, other, outsider, headers = actors
    path = f"/api/v1/teams/{team.id}"
    payload = {
        "title": "写测试",
        "assignee_id": member.id,
        "due_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
    }
    result = client.post(path + "/tasks", json=payload, headers=headers(owner))
    assert result.status_code == 201, result.text
    task = result.json()
    resource = f"/api/v1/tasks/{task['id']}"
    assert task["overdue"]
    assert (
        client.patch(resource, json={"title": "越权"}, headers=headers(member)).status_code == 403
    )
    assert client.post(resource + "/complete", headers=headers(other)).status_code == 403
    assert client.post(resource + "/complete", headers=headers(outsider)).status_code == 404
    done = client.post(resource + "/complete", headers=headers(member)).json()
    assert done["completed_at"] and not done["overdue"]
    reopened = client.post(resource + "/reopen", headers=headers(member)).json()
    assert reopened["completed_at"] is None and reopened["status"] == "todo"
    assert client.get(path + "/tasks?mine=true", headers=headers(member)).json()["total"] == 1
    assert client.get(path + "/tasks?status=done", headers=headers(owner)).json()["total"] == 0
    assert (
        client.post(
            path + "/tasks", json={**payload, "assignee_id": outsider.id}, headers=headers(owner)
        ).status_code
        == 422
    )
    private = client.post(
        path + "/events", json=event_data(owner.id, visibility="private"), headers=headers(member)
    ).json()
    assert client.delete(path + f"/members/{owner.id}", headers=headers(owner)).status_code == 403
    assert client.delete(path + f"/members/{member.id}", headers=headers(owner)).status_code == 204
    db.expire_all()
    assert db.get(Task, task["id"]).assignee_id is None
    assert db.get(Event, private["id"]).status == "cancelled"
    assert client.get(path + "/tasks", headers=headers(member)).status_code == 404
    assert not list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == member.id, Notification.read_at.is_(None)
            )
        )
    )
    assert client.delete(resource, headers=headers(owner)).status_code == 204


def test_roles_rotate_leave_delete(client, actors):
    team, owner, member, other, outsider, headers = actors
    path = f"/api/v1/teams/{team.id}"
    assert (
        client.patch(
            path + f"/members/{member.id}", json={"role": "admin"}, headers=headers(member)
        ).status_code
        == 403
    )
    assert (
        client.patch(
            path + f"/members/{member.id}", json={"role": "admin"}, headers=headers(owner)
        ).status_code
        == 200
    )
    assert client.delete(path + f"/members/{owner.id}", headers=headers(member)).status_code == 403
    code = client.post(path + "/invite-code/rotate", headers=headers(member)).json()["invite_code"]
    assert code != team.invite_code
    assert (
        client.post(
            "/api/v1/teams/join", json={"invite_code": team.invite_code}, headers=headers(outsider)
        ).status_code
        == 409
    )
    assert client.post(path + "/leave", headers=headers(member)).status_code == 204
    assert client.post(path + "/leave", headers=headers(owner)).status_code == 403
    assert client.delete(path, headers=headers(other)).status_code == 403
    assert client.delete(path, headers=headers(owner)).status_code == 204
    assert client.get(path, headers=headers(owner)).status_code == 404


def test_time_all_day_cross_month_limits_and_started(client, actors):
    team, owner, member, other, outsider, headers = actors
    path = f"/api/v1/teams/{team.id}"
    # 上海闰日全天：本地 00:00 到次日 00:00。
    payload = event_data(
        member.id, start_at="2028-02-28T16:00:00Z", end_at="2028-02-29T16:00:00Z", all_day=True
    )
    result = client.post(path + "/events", json=payload, headers=headers(owner))
    assert result.status_code == 201, result.text
    assert result.json()["start_at"] == "2028-02-28T16:00:00Z"
    assert (
        client.post(
            path + "/events",
            json={**payload, "end_at": payload["start_at"]},
            headers=headers(owner),
        ).status_code
        == 422
    )
    assert (
        client.post(
            path + "/events",
            json={**payload, "start_at": "2028-02-28T17:00:00Z"},
            headers=headers(owner),
        ).status_code
        == 422
    )
    for endpoint, days in (("events", 93), ("availability", 32)):
        assert (
            client.get(
                path + "/" + endpoint,
                params={
                    "from": "2028-01-01T00:00:00Z",
                    "to": (datetime(2028, 1, 1, tzinfo=UTC) + timedelta(days=days)).isoformat(),
                },
                headers=headers(owner),
            ).status_code
            == 422
        )
    past = client.post(
        path + "/events",
        json=event_data(member.id, start_at="2020-12-31T15:30:00Z", end_at="2020-12-31T16:30:00Z"),
        headers=headers(owner),
    ).json()
    resource = f"/api/v1/events/{past['id']}"
    assert (
        client.patch(resource, json={"location": "更改"}, headers=headers(owner)).json()["code"]
        == "EVENT_ALREADY_STARTED"
    )
    assert (
        client.patch(
            resource + "/rsvp", json={"response": "accepted"}, headers=headers(member)
        ).json()["code"]
        == "EVENT_ENDED"
    )


def test_reminder_dedupe_daily_bucket_and_deleted_team(client, actors, db):
    team, owner, member, other, outsider, headers = actors
    now = datetime.now(UTC)
    path = f"/api/v1/teams/{team.id}"
    event = client.post(
        path + "/events",
        json=event_data(
            member.id,
            start_at=(now + timedelta(minutes=10)).isoformat(),
            end_at=(now + timedelta(hours=1)).isoformat(),
        ),
        headers=headers(owner),
    )
    assert event.status_code == 201
    client.post(
        path + "/tasks",
        json={
            "title": "即将截止",
            "assignee_id": member.id,
            "due_at": (now + timedelta(minutes=30)).isoformat(),
        },
        headers=headers(owner),
    )
    scan_reminders(db, now)
    scan_reminders(db, now)
    notices = list(db.scalars(select(Notification).where(Notification.user_id == member.id)))
    assert sum(n.type == "event.reminder" for n in notices) == 1
    assert sum(n.type == "task.due_soon" for n in notices) == 1
    tomorrow = (now + timedelta(days=1)).replace(hour=4)  # 上海中午
    scan_reminders(db, tomorrow)
    scan_reminders(db, tomorrow)
    assert (
        len(list(db.scalars(select(Notification).where(Notification.type == "task.overdue")))) == 1
    )
    scan_reminders(db, tomorrow + timedelta(days=1))
    assert (
        len(list(db.scalars(select(Notification).where(Notification.type == "task.overdue")))) == 2
    )


def test_websocket_auth_and_heartbeat(client, actors):
    team, owner, member, other, outsider, headers = actors
    token = create_access_token(owner.id, owner.username)
    with client.websocket_connect(f"/api/v1/ws?token={token}") as ws:
        assert ws.receive_json()["type"] == "connected"
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"
    from starlette.websockets import WebSocketDisconnect

    with (
        pytest.raises(WebSocketDisconnect) as exc,
        client.websocket_connect("/api/v1/ws?token=bad"),
    ):
        pass
    assert exc.value.code == 4401


def test_removed_private_participant_loses_details_but_decline_can_be_reversed(client, actors):
    team, owner, member, other, outsider, headers = actors
    result = client.post(
        f"/api/v1/teams/{team.id}/events",
        json=event_data(member.id, visibility="private"),
        headers=headers(owner),
    )
    resource = f"/api/v1/events/{result.json()['id']}"
    assert (
        client.patch(
            resource + "/rsvp", json={"response": "declined"}, headers=headers(member)
        ).status_code
        == 200
    )
    assert client.get(resource, headers=headers(member)).status_code == 200
    assert (
        client.patch(
            resource + "/rsvp", json={"response": "accepted"}, headers=headers(member)
        ).status_code
        == 200
    )
    assert (
        client.delete(resource + f"/participants/{member.id}", headers=headers(owner)).status_code
        == 204
    )
    assert client.get(resource, headers=headers(member)).status_code == 404
    assert (
        client.post(
            resource + "/participants", json={"user_ids": [member.id]}, headers=headers(owner)
        ).status_code
        == 200
    )
    assert client.get(resource, headers=headers(member)).status_code == 200


def test_backup_is_consistent_idempotent_and_retains_seven(tmp_path):
    import sqlite3

    from app.scheduler.backup import backup_sqlite

    source = tmp_path / "source.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE sample (value TEXT)")
        connection.execute("INSERT INTO sample VALUES ('persisted')")
    for day in range(10):
        now = datetime(2026, 11, 1, tzinfo=UTC) + timedelta(days=day)
        target = backup_sqlite(f"sqlite:///{source}", now)
        assert target == backup_sqlite(f"sqlite:///{source}", now)
        with sqlite3.connect(target) as connection:
            assert connection.execute("SELECT value FROM sample").fetchone() == ("persisted",)
    assert len(list((tmp_path / "backups").glob("*.db"))) == 7


def test_websocket_private_mutation_only_sends_masked_calendar_change(client, actors):
    team, owner, member, other, outsider, headers = actors
    with client.websocket_connect(
        f"/api/v1/ws?token={create_access_token(other.id, other.username)}"
    ) as ws:
        assert ws.receive_json()["type"] == "connected"
        created = client.post(
            f"/api/v1/teams/{team.id}/events",
            json=event_data(member.id, visibility="private", title="秘密标题"),
            headers=headers(owner),
        )
        assert created.status_code == 201
        message = ws.receive_json()
        assert message["type"] == "calendar.changed"
        assert message["payload"] == {"team_id": team.id}
        assert "秘密标题" not in str(message)


def test_ws_log_redaction_preserves_uvicorn_access_format():
    import logging

    from uvicorn.logging import AccessFormatter

    from app.logging import RedactTokenFilter

    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "test",
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1", "GET", "/api/v1/ws?token=secret-token", "1.1", 200),
        None,
    )
    assert RedactTokenFilter().filter(record)
    output = AccessFormatter(
        "%(client_addr)s %(request_line)s %(status_code)s", use_colors=False
    ).format(record)
    assert "secret-token" not in output
    assert "[REDACTED]" in output


def test_team_limit_is_enforced(client, user_factory, team_factory):
    owner = user_factory(username="limited")
    for index in range(20):
        team_factory(owner=owner, name=f"团队 {index}")
    result = client.post(
        "/api/v1/teams",
        json={"name": "超额团队"},
        headers={"Authorization": f"Bearer {create_access_token(owner.id, owner.username)}"},
    )
    assert result.status_code == 422
