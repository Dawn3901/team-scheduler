"""反复的同一通知：同一活动的同类通知只保留一条未读（用户 2026-11-16 反馈）。"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Event, Notification
from app.scheduler.reminders import scan_reminders
from app.security import create_access_token


@pytest.fixture()
def actors(client, user_factory, team_factory, team_member_factory):
    owner = user_factory(username="owner")
    member = user_factory(username="member")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=member)

    def headers(user):
        return {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}

    return team, owner, member, headers


def _event(uid, **changes):
    start = datetime.now(UTC) + timedelta(days=3)
    return {
        "title": "评审",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(),
        "participant_ids": [uid],
        **changes,
    }


def _notices(client, user, headers):
    return client.get("/api/v1/notifications?limit=100", headers=headers(user)).json()


def _unread_of(items, kind):
    return [n for n in items if n["type"] == kind and n["read_at"] is None]


def test_repeated_event_updates_keep_one_unread_notice(client, actors):
    team, owner, member, headers = actors
    path = f"/api/v1/teams/{team.id}"
    created = client.post(path + "/events", json=_event(member.id), headers=headers(owner))
    assert created.status_code == 201, created.text
    eid = created.json()["id"]
    # 被邀请人先接受，后续改期才需要重新确认。
    assert (
        client.patch(
            f"/api/v1/events/{eid}/rsvp", json={"response": "accepted"}, headers=headers(member)
        ).status_code
        == 200
    )

    base = datetime.now(UTC) + timedelta(days=4)
    for index in range(3):
        start = base + timedelta(hours=index)
        patched = client.patch(
            f"/api/v1/events/{eid}",
            json={
                "start_at": start.isoformat(),
                "end_at": (start + timedelta(hours=1)).isoformat(),
            },
            headers=headers(owner),
        )
        assert patched.status_code == 200, patched.text
        # 改期后重新确认（否则第二次改期不会给 accepted 发通知）。
        client.patch(
            f"/api/v1/events/{eid}/rsvp", json={"response": "accepted"}, headers=headers(member)
        )

    data = _notices(client, member, headers)
    updates = [n for n in data["items"] if n["type"] == "event.updated"]
    assert len(updates) == 1, updates
    assert len(_unread_of(data["items"], "event.updated")) == 1
    # 同一次事件还只应有 1 条邀请通知。
    assert len([n for n in data["items"] if n["type"] == "event.invited"]) == 1


def test_new_change_after_read_creates_one_more_unread(client, actors):
    team, owner, member, headers = actors
    path = f"/api/v1/teams/{team.id}"
    eid = client.post(path + "/events", json=_event(member.id), headers=headers(owner)).json()["id"]
    client.patch(
        f"/api/v1/events/{eid}/rsvp", json={"response": "accepted"}, headers=headers(member)
    )
    first = datetime.now(UTC) + timedelta(days=5)
    for offset in (0, 1):
        start = first + timedelta(hours=offset)
        client.patch(
            f"/api/v1/events/{eid}",
            json={
                "start_at": start.isoformat(),
                "end_at": (start + timedelta(hours=1)).isoformat(),
            },
            headers=headers(owner),
        )
        client.patch(
            f"/api/v1/events/{eid}/rsvp", json={"response": "accepted"}, headers=headers(member)
        )

    data = _notices(client, member, headers)
    notice = _unread_of(data["items"], "event.updated")[0]
    assert client.post(
        f"/api/v1/notifications/{notice['id']}/read", headers=headers(member)
    ).status_code == 204
    assert _unread_of(_notices(client, member, headers)["items"], "event.updated") == []

    third = first + timedelta(hours=2)
    client.patch(
        f"/api/v1/events/{eid}",
        json={"start_at": third.isoformat(), "end_at": (third + timedelta(hours=1)).isoformat()},
        headers=headers(owner),
    )
    data = _notices(client, member, headers)
    unread = _unread_of(data["items"], "event.updated")
    assert len(unread) == 1
    # 已读的那条被原地复用并重新标记未读，历史里不重复堆积。
    assert unread[0]["id"] == notice["id"]
    assert len(data["items"]) == 2  # 邀请 1 条 + 变更 1 条，不随改期次数增长
    assert [n["type"] for n in data["items"]].count("event.updated") == 1


def test_cancel_notice_does_not_swallow_reminder(client, actors, db):
    team, owner, member, headers = actors
    path = f"/api/v1/teams/{team.id}"
    start = datetime.now(UTC) + timedelta(minutes=10)
    payload = _event(
        member.id,
        start_at=start.isoformat(),
        end_at=(start + timedelta(minutes=30)).isoformat(),
    )
    eid = client.post(path + "/events", json=payload, headers=headers(owner)).json()["id"]
    scan_reminders(db)
    client.patch(f"/api/v1/events/{eid}", json={"status": "cancelled"}, headers=headers(owner))
    data = _notices(client, member, headers)
    types = sorted(n["type"] for n in data["items"])
    assert types == ["event.cancelled", "event.invited", "event.reminder"], types


def test_event_reminder_key_ignores_moved_start(client, actors, db):
    team, owner, member, headers = actors
    path = f"/api/v1/teams/{team.id}"
    start = datetime.now(UTC) + timedelta(days=2)
    payload = _event(
        member.id, start_at=start.isoformat(), end_at=(start + timedelta(hours=1)).isoformat()
    )
    eid = client.post(path + "/events", json=payload, headers=headers(owner)).json()["id"]

    # 两次改期都落在（未来）15 分钟窗口内；提醒由调度器按窗口生成。
    for minutes in (5, 10):
        event = db.get(Event, eid)
        moved = datetime.now(UTC) + timedelta(minutes=minutes)
        event.start_at, event.end_at = moved, moved + timedelta(minutes=30)
        db.commit()
        scan_reminders(db)

    reminders = list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == member.id,
                Notification.type == "event.reminder",
                # 不用 LIKE '%event_id: 7%'：会被 event_id: 70 误命中。
                Notification.dedupe_key == f"event.reminder:{member.id}:{eid}:15m",
            )
        )
    )
    assert len(reminders) == 1


def test_task_reassignment_keeps_one_unread(client, actors):
    team, owner, member, headers = actors
    path = f"/api/v1/teams/{team.id}"
    due = datetime.now(UTC) + timedelta(days=1)
    tid = client.post(
        path + "/tasks",
        json={"title": "写文档", "assignee_id": member.id, "due_at": due.isoformat()},
        headers=headers(owner),
    ).json()["id"]
    # 先改给别人再改回来，被指派人才可能收到第二条指派通知。
    client.patch(f"/api/v1/tasks/{tid}", json={"assignee_id": owner.id}, headers=headers(owner))
    client.patch(f"/api/v1/tasks/{tid}", json={"assignee_id": member.id}, headers=headers(owner))
    data = _notices(client, member, headers)
    assert len([n for n in data["items"] if n["type"] == "task.assigned"]) == 1
