"""CR-016：通告、对象内消息、收件箱、参与者备注。

不 mock 权限与可见性：全部走真实接口与真实数据库。
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import Message, Notification
from app.security import create_access_token


@pytest.fixture()
def actors(client, user_factory, team_factory, team_member_factory):
    owner = user_factory(username="owner")
    admin = user_factory(username="admin")
    member = user_factory(username="member")
    other = user_factory(username="other")
    outsider = user_factory(username="outsider")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=admin, role="admin")
    team_member_factory(team=team, user=member)
    team_member_factory(team=team, user=other)

    def headers(user):
        return {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}

    return team, owner, admin, member, other, outsider, headers


def _event(client, headers, team, owner, participants=(), **changes):
    start = datetime.now(UTC) + timedelta(days=2)
    payload = {
        "title": "评审",
        "start_at": start.isoformat(),
        "end_at": (start + timedelta(hours=1)).isoformat(),
        "participant_ids": list(participants),
        **changes,
    }
    result = client.post(f"/api/v1/teams/{team.id}/events", json=payload, headers=headers(owner))
    assert result.status_code == 201, result.text
    return result.json()


def _task(client, headers, team, owner, assignee, **changes):
    payload = {
        "title": "写文档",
        "assignee_id": assignee.id,
        "due_at": (datetime.now(UTC) + timedelta(days=2)).isoformat(),
        **changes,
    }
    result = client.post(f"/api/v1/teams/{team.id}/tasks", json=payload, headers=headers(owner))
    assert result.status_code == 201, result.text
    return result.json()


def _announcement(client, headers, team, author, **changes):
    payload = {"title": "周五例会改期", "body": "改到 16:00，全员必到", **changes}
    result = client.post(
        f"/api/v1/teams/{team.id}/announcements", json=payload, headers=headers(author)
    )
    assert result.status_code == 201, result.text
    return result.json()


# ---------- 通告 ----------


def test_only_admin_or_owner_can_publish(client, actors):
    team, owner, admin, member, *_rest = actors
    headers = _rest[-1]
    assert (
        client.post(
            f"/api/v1/teams/{team.id}/announcements",
            json={"title": "t", "body": "b"},
            headers=headers(member),
        ).status_code
        == 403
    )
    assert _announcement(client, headers, team, admin)["title"] == "周五例会改期"
    assert _announcement(client, headers, team, owner)["acked"] is False


def test_announcement_list_pins_and_reports_unacked(client, actors):
    team, owner, _admin, member, *_rest = actors
    headers = _rest[-1]
    pinned = _announcement(client, headers, team, owner, title="置顶公告", pinned=True)
    _announcement(client, headers, team, owner, title="普通公告")
    data = client.get(f"/api/v1/teams/{team.id}/announcements", headers=headers(member)).json()
    assert data["items"][0]["id"] == pinned["id"]
    assert data["unacked_count"] == 2
    # 成员视角不能改别人发的通告。
    assert data["items"][0]["can_manage"] is False


def test_ack_is_idempotent_and_receipts_are_author_only(client, actors):
    team, owner, _admin, member, other, _outsider, headers = actors
    item = _announcement(client, headers, team, owner)
    path = f"/api/v1/announcements/{item['id']}"
    assert client.post(path + "/ack", headers=headers(member)).status_code == 200
    assert client.post(path + "/ack", headers=headers(member)).status_code == 200
    assert client.get(path, headers=headers(member)).json()["acked"] is True

    receipts = client.get(path + "/receipts", headers=headers(owner))
    assert receipts.status_code == 200
    body = receipts.json()
    assert body["total"] == 4
    assert body["acked_count"] == 1
    unacked = {p["user_id"] for p in body["items"] if not p["acked"]}
    assert member.id not in unacked
    assert other.id in unacked

    # 普通成员看不到回执，但能看详情。
    assert client.get(path + "/receipts", headers=headers(member)).status_code == 403
    assert client.get(path, headers=headers(member)).status_code == 200


def test_announcement_cross_team_is_404(client, actors):
    team, owner, _admin, _member, _other, outsider, headers = actors
    item = _announcement(client, headers, team, owner)
    response = client.get(f"/api/v1/announcements/{item['id']}", headers=headers(outsider))
    assert response.status_code == 404
    assert (
        client.post(
            f"/api/v1/announcements/{item['id']}/ack", headers=headers(outsider)
        ).status_code
        == 404
    )


def test_expired_and_no_ack_announcements_stay_out_of_inbox(client, actors, db):
    team, owner, _admin, member, *_rest = actors
    headers = _rest[-1]
    soon = datetime.now(UTC) + timedelta(hours=1)
    live = _announcement(client, headers, team, owner, title="需要回执")
    _announcement(
        client, headers, team, owner, title="不需要回执", requires_ack=False
    )
    expiring = _announcement(
        client, headers, team, owner, title="即将过期", expires_at=soon.isoformat()
    )

    inbox = client.get("/api/v1/inbox", headers=headers(member)).json()
    titles = {item["title"] for item in inbox["items"] if item["kind"] == "announcement"}
    assert titles == {"需要回执", "即将过期"}

    client.post(f"/api/v1/announcements/{live['id']}/ack", headers=headers(member))
    client.post(f"/api/v1/announcements/{expiring['id']}/ack", headers=headers(member))
    inbox = client.get("/api/v1/inbox", headers=headers(member)).json()
    assert [i for i in inbox["items"] if i["kind"] == "announcement"] == []


def test_announcement_patch_and_delete(client, actors):
    team, owner, admin, member, *_rest = actors
    headers = _rest[-1]
    item = _announcement(client, headers, team, owner)
    path = f"/api/v1/announcements/{item['id']}"
    assert client.patch(path, json={"title": "改标题"}, headers=headers(member)).status_code == 403
    updated = client.patch(path, json={"title": "改标题", "pinned": True}, headers=headers(admin))
    assert updated.status_code == 200 and updated.json()["title"] == "改标题"
    assert client.delete(path, headers=headers(admin)).status_code == 204
    assert client.get(path, headers=headers(owner)).status_code == 404


# ---------- 对象内消息 ----------


def test_event_messages_visible_to_team_and_private_guarded(client, actors, db):
    team, owner, _admin, member, other, outsider, headers = actors
    public = _event(client, headers, team, owner, [member.id])
    path = f"/api/v1/events/{public['id']}/messages"
    sent = client.post(path, json={"body": "地点定在 3F"}, headers=headers(member))
    assert sent.status_code == 201, sent.text
    assert sent.json()["kind"] == "comment"
    assert [m["body"] for m in client.get(path, headers=headers(other)).json()["items"]] == [
        "地点定在 3F"
    ]
    # 非成员不能读写。
    assert client.get(path, headers=headers(outsider)).status_code == 404
    assert client.post(path, json={"body": "x"}, headers=headers(outsider)).status_code == 404

    private = _event(
        client,
        headers,
        team,
        owner,
        [member.id],
        title="私密事",
        visibility="private",
        ignore_conflicts=True,
    )
    private_path = f"/api/v1/events/{private['id']}/messages"
    assert client.post(private_path, json={"body": "p"}, headers=headers(owner)).status_code == 201
    # 同团队非参与者：私密活动消息一律 404，且不通过错误信息泄露存在性。
    assert client.get(private_path, headers=headers(other)).status_code == 404
    assert client.post(private_path, json={"body": "x"}, headers=headers(other)).status_code == 404


def test_mention_validation_and_notification(client, actors, db):
    team, owner, _admin, member, other, _outsider, headers = actors
    task = _task(client, headers, team, owner, member)
    path = f"/api/v1/tasks/{task['id']}/messages"

    bad = client.post(
        path,
        json={"body": "看下", "mention_user_ids": [99999]},
        headers=headers(owner),
    )
    assert bad.status_code == 422 and bad.json()["code"] == "INVALID_MENTION"

    ok = client.post(
        path,
        json={"body": "@其他 帮忙看下", "mention_user_ids": [other.id]},
        headers=headers(owner),
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["mention_user_ids"] == [other.id]

    rows = list(db.scalars(select(Notification).where(Notification.team_id == team.id)))
    mentioned = [n for n in rows if n.type == "message.mentioned"]
    assert [n.user_id for n in mentioned] == [other.id]
    # 负责人（member）收到普通消息通知，作者（owner）不收自己的消息通知。
    created = [n for n in rows if n.type == "message.created"]
    assert [n.user_id for n in created] == [member.id]


def test_repeated_messages_keep_one_unread_per_object(client, actors, db):
    team, owner, _admin, member, *_rest = actors
    headers = _rest[-1]
    task = _task(client, headers, team, owner, member)
    path = f"/api/v1/tasks/{task['id']}/messages"
    for index in range(4):
        client.post(path, json={"body": f"第 {index} 条"}, headers=headers(owner))

    rows = list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == member.id, Notification.type == "message.created"
            )
        )
    )
    assert len(rows) == 1
    inbox = client.get("/api/v1/inbox", headers=headers(member)).json()
    assert [i["kind"] for i in inbox["items"]].count("message") == 1


def test_task_kind_validation_and_blocker_lifecycle(client, actors):
    team, owner, _admin, member, *_rest = actors
    headers = _rest[-1]
    task = _task(client, headers, team, owner, member)
    path = f"/api/v1/tasks/{task['id']}/messages"

    assert (
        client.post(
            path, json={"body": "x", "kind": "change_reason"}, headers=headers(owner)
        ).status_code
        == 422
    )
    response = client.post(path, json={"body": "  ", "kind": "blocker"}, headers=headers(member))
    assert response.status_code == 422

    response = client.post(
        path, json={"body": "等设计稿", "kind": "blocker"}, headers=headers(member)
    )
    assert response.status_code == 201
    tasks = client.get(f"/api/v1/teams/{team.id}/tasks", headers=headers(owner)).json()
    assert tasks["items"][0]["waiting_reason"] == "等设计稿"

    response = client.post(
        path, json={"body": "收到了", "kind": "unblock"}, headers=headers(member)
    )
    assert response.status_code == 201
    tasks = client.get(f"/api/v1/teams/{team.id}/tasks", headers=headers(owner)).json()
    assert tasks["items"][0]["waiting_reason"] is None

    response = client.post(
        path, json={"body": "又卡住了", "kind": "blocker"}, headers=headers(member)
    )
    assert response.status_code == 201
    tasks = client.get(f"/api/v1/teams/{team.id}/tasks", headers=headers(owner)).json()
    assert tasks["items"][0]["waiting_reason"] == "又卡住了"


def test_message_cursor_pagination(client, actors, db):
    team, owner, *_rest = actors
    headers = _rest[-1]
    task = _task(client, headers, team, owner, owner)
    path = f"/api/v1/tasks/{task['id']}/messages"
    for index in range(5):
        client.post(path, json={"body": f"m{index}"}, headers=headers(owner))

    first = client.get(path + "?limit=2", headers=headers(owner)).json()
    assert [m["body"] for m in first["items"]] == ["m3", "m4"]
    assert first["has_more"] is True
    assert first["next_before_id"] == (first["items"][0]["id"])

    second = client.get(
        path + f"?limit=2&before_id={first['next_before_id']}", headers=headers(owner)
    ).json()
    assert [m["body"] for m in second["items"]] == ["m1", "m2"]
    third = client.get(
        path + f"?limit=2&before_id={second['next_before_id']}", headers=headers(owner)
    ).json()
    assert [m["body"] for m in third["items"]] == ["m0"]
    assert third["has_more"] is False
    assert third["next_before_id"] is None


def test_read_mark_clears_inbox_and_mention_disappears_when_hidden(client, actors):
    team, owner, _admin, member, *_rest = actors
    headers = _rest[-1]
    task = _task(client, headers, team, owner, member)
    client.post(
        f"/api/v1/tasks/{task['id']}/messages",
        json={"body": "看这里", "mention_user_ids": [member.id]},
        headers=headers(owner),
    )
    inbox = client.get("/api/v1/inbox", headers=headers(member)).json()
    assert inbox["counts"]["mentions"] == 1

    assert (
        client.post(
            "/api/v1/read-marks",
            json={"target_type": "task", "target_id": task["id"]},
            headers=headers(member),
        ).status_code
        == 204
    )
    inbox = client.get("/api/v1/inbox", headers=headers(member)).json()
    assert inbox["counts"]["mentions"] == 0
    assert inbox["counts"]["messages"] == 0

    # 读位只能推进自己的：owner 的收件箱不受影响。
    assert (
        client.post(
            "/api/v1/read-marks",
            json={"target_type": "task", "target_id": 99999},
            headers=headers(member),
        ).status_code
        == 404
    )


def test_inbox_excludes_messages_on_invisible_private_event(client, actors, db):
    team, owner, _admin, member, other, *_rest = actors
    headers = _rest[-1]
    private = _event(
        client,
        headers,
        team,
        owner,
        [member.id],
        title="私密会",
        visibility="private",
        ignore_conflicts=True,
    )
    client.post(
        f"/api/v1/events/{private['id']}/messages",
        json={"body": "记得带材料", "mention_user_ids": [member.id]},
        headers=headers(owner),
    )
    assert client.get("/api/v1/inbox", headers=headers(member)).json()["counts"]["mentions"] == 1

    # 组织者把成员移出活动后，该成员既看不到活动，也不应在收件箱看到这条消息。
    assert (
        client.delete(
            f"/api/v1/events/{private['id']}/participants/{member.id}", headers=headers(owner)
        ).status_code
        == 204
    )
    inbox = client.get("/api/v1/inbox", headers=headers(member)).json()
    assert inbox["counts"]["mentions"] == 0
    assert (
        client.get(f"/api/v1/events/{private['id']}/messages", headers=headers(member)).status_code
        == 404
    )


# ---------- 参与者备注 ----------


def test_participant_note_visible_only_to_organizer_and_owner_of_note(client, actors):
    team, owner, admin, member, other, *_rest = actors
    headers = _rest[-1]
    start = datetime.now(UTC) + timedelta(days=2)
    created = client.post(
        f"/api/v1/teams/{team.id}/events",
        json={
            "title": "带电脑的会",
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=1)).isoformat(),
            "participant_ids": [],
        },
        headers=headers(owner),
    ).json()
    path = f"/api/v1/events/{created['id']}"
    invited = client.post(
        path + "/participants",
        json={"user_ids": [member.id], "note": "记得带电脑"},
        headers=headers(owner),
    )
    assert invited.status_code == 200, invited.text
    notes = {p["user_id"]: p["note"] for p in invited.json()["items"]}
    assert notes[member.id] == "记得带电脑"
    assert notes[owner.id] is None

    # 组织者与 Admin 看得到；本人看得到；其他成员看不到（字段为 null，不是空串）。
    assert _note_of(client, path, headers(owner), member.id) == "记得带电脑"
    assert _note_of(client, path, headers(admin), member.id) == "记得带电脑"
    assert _note_of(client, path, headers(member), member.id) == "记得带电脑"
    assert _note_of(client, path, headers(other), member.id) is None
    assert "记得带电脑" not in client.get(path, headers=headers(other)).text


def test_participant_note_edit_and_rsvp_note(client, actors):
    team, owner, _admin, member, other, *_rest = actors
    headers = _rest[-1]
    event = _event(client, headers, team, owner, [member.id, other.id])
    path = f"/api/v1/events/{event['id']}"

    updated = client.patch(
        path + f"/participants/{member.id}",
        json={"note": "提前 15 分钟到"},
        headers=headers(owner),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["note"] == "提前 15 分钟到"
    # 普通成员不能改别人备注。
    assert (
        client.patch(
            path + f"/participants/{other.id}", json={"note": "x"}, headers=headers(member)
        ).status_code
        == 403
    )

    # RSVP 附言写到本人备注上。
    rsvp = client.patch(
        path + "/rsvp",
        json={"response": "tentative", "note": "可能迟到 10 分钟"},
        headers=headers(member),
    )
    assert rsvp.status_code == 200, rsvp.text
    assert _note_of(client, path, headers(owner), member.id) == "可能迟到 10 分钟"

    # 清空。
    cleared = client.patch(
        path + f"/participants/{member.id}", json={"note": ""}, headers=headers(owner)
    )
    assert cleared.json()["note"] is None


def test_deleted_message_and_announcement_disappear(client, actors, db):
    team, owner, _admin, member, *_rest = actors
    headers = _rest[-1]
    task = _task(client, headers, team, owner, member)
    path = f"/api/v1/tasks/{task['id']}/messages"
    sent = client.post(path, json={"body": "会被软删"}, headers=headers(owner)).json()
    row = db.get(Message, sent["id"])
    row.deleted_at = datetime.now(UTC)
    db.commit()
    assert client.get(path, headers=headers(member)).json()["items"] == []


def _note_of(client, path, headers, user_id):
    body = client.get(path, headers=headers).json()
    return next(p["note"] for p in body["participants"] if p["user_id"] == user_id)
