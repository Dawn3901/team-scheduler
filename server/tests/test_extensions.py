"""四项拓展的业务边界、事务、权限和算法回归。"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.models import Event, EventSeries, Notification, Task
from app.security import create_access_token


@pytest.fixture()
def setup(client, user_factory, team_factory, team_member_factory):
    owner = user_factory(username="owner")
    member = user_factory(username="member")
    outsider = user_factory(username="outsider")
    team = team_factory(owner=owner)
    team_member_factory(team=team, user=member)

    def headers(user):
        return {"Authorization": f"Bearer {create_access_token(user.id, user.username)}"}

    return team, owner, member, outsider, headers


def event(client, setup, **changes):
    team, owner, member, _, headers = setup
    return client.post(
        f"/api/v1/teams/{team.id}/events",
        headers=headers(owner),
        json={
            "title": "组会",
            "start_at": "2028-01-03T01:00:00Z",
            "end_at": "2028-01-03T02:00:00Z",
            "participant_ids": [member.id],
            **changes,
        },
    )


def task(client, setup, **changes):
    team, owner, member, _, headers = setup
    return client.post(
        f"/api/v1/teams/{team.id}/tasks",
        headers=headers(owner),
        json={
            "title": "实现",
            "assignee_id": member.id,
            "due_at": "2028-01-10T10:00:00Z",
            **changes,
        },
    )


def list_events(client, setup):
    team, owner, _, _, headers = setup
    return client.get(
        f"/api/v1/teams/{team.id}/events",
        headers=headers(owner),
        params={
            "from": "2028-01-01T00:00:00Z",
            "to": "2028-03-01T00:00:00Z",
            "limit": 100,
        },
    ).json()["items"]


def suggestions(client, setup, who=None, **params):
    team, owner, _, _, headers = setup
    return client.get(
        f"/api/v1/teams/{team.id}/availability/suggestions",
        headers=headers(who or owner),
        params={
            "from": "2028-01-03T00:00:00Z",
            "to": "2028-01-03T10:00:00Z",
            "duration_minutes": 60,
            **params,
        },
    )


def test_suggestions_privacy_optional_ranking_and_required(setup, client):
    team, owner, member, outsider, headers = setup
    assert (
        event(
            client,
            setup,
            title="秘密标题",
            location="秘密地点",
            visibility="private",
            participant_ids=[],
        ).status_code
        == 201
    )
    # 必到member空闲，owner仅作可选：避开owner的09–10安排，得分更高。
    result = suggestions(
        client, setup, who=member, member_ids=f"{owner.id},{member.id}", required_ids=str(member.id)
    )
    assert result.status_code == 200, result.text
    items = result.json()["suggestions"]
    assert len(items) == 3 and items[0]["start_at"] == "2028-01-03T02:00:00Z"
    assert items[0]["score"] == 1 and items[0]["available_member_ids"] == [owner.id, member.id]
    assert "秘密" not in result.text and "event_id" not in result.text
    assert suggestions(client, setup, who=outsider).status_code == 404
    assert suggestions(client, setup, required_ids=str(outsider.id)).status_code == 422
    assert suggestions(client, setup, member_ids=str(outsider.id)).status_code == 422
    # 工作窗口只有一小时，owner不空闲，只能返回较低评分。
    result = suggestions(
        client,
        setup,
        who=member,
        member_ids=f"{owner.id},{member.id}",
        required_ids=str(member.id),
        work_end="10:00",
    )
    candidate = result.json()["suggestions"][0]
    assert candidate["score"] == 0.7 and candidate["missing_optional_ids"] == [owner.id]


def test_suggestions_all_day_declined_buffers_and_no_slots(client, setup):
    _, _, member, _, headers = setup
    created = event(
        client,
        setup,
        all_day=True,
        start_at="2028-01-02T16:00:00Z",
        end_at="2028-01-03T16:00:00Z",
        participant_ids=[],
    )
    assert created.status_code == 201
    assert suggestions(client, setup).json()["suggestions"] == []
    # 只找member：owner的私有忙闲无关；前后15分钟须完整落在工作窗口。
    result = suggestions(client, setup, member_ids=str(member.id), buffer_minutes=15)
    assert result.json()["suggestions"][0]["start_at"] == "2028-01-03T01:15:00Z"
    second = event(client, setup, ignore_conflicts=True)
    assert (
        client.patch(
            f"/api/v1/events/{second.json()['id']}/rsvp",
            headers=headers(member),
            json={"response": "declined"},
        ).status_code
        == 200
    )
    assert (
        suggestions(client, setup, member_ids=str(member.id)).json()["suggestions"][0]["start_at"]
        == "2028-01-03T01:00:00Z"
    )


@pytest.mark.parametrize(
    "params",
    [
        {"duration_minutes": 0},
        {"duration_minutes": 481},
        {"buffer_minutes": 61},
        {"work_start": "19:00", "work_end": "18:00"},
        {"work_start": "garbage"},
        {"from": "2028-01-01T00:00:00Z", "to": "2028-02-03T00:00:00Z"},
        {"member_ids": "oops"},
        {"member_ids": ""},
    ],
)
def test_suggestion_validation(client, setup, params):
    assert suggestions(client, setup, **params).status_code in (400, 422)


def test_suggestions_weekend_and_dst(client, setup, db):
    team, _, _, _, _ = setup
    assert (
        suggestions(
            client, setup, **{"from": "2028-01-08T00:00:00Z", "to": "2028-01-09T00:00:00Z"}
        ).json()["suggestions"]
        == []
    )
    assert suggestions(
        client,
        setup,
        **{"from": "2028-01-08T00:00:00Z", "to": "2028-01-09T00:00:00Z", "include_weekend": True},
    ).json()["suggestions"]
    team.timezone = "America/New_York"
    db.commit()
    before = suggestions(
        client, setup, **{"from": "2028-03-10T00:00:00Z", "to": "2028-03-11T00:00:00Z"}
    ).json()["suggestions"][0]
    after = suggestions(
        client, setup, **{"from": "2028-03-13T00:00:00Z", "to": "2028-03-14T00:00:00Z"}
    ).json()["suggestions"][0]
    assert before["start_at"] == "2028-03-10T14:00:00Z"
    assert after["start_at"] == "2028-03-13T13:00:00Z"


def test_reconfirmation_actual_change_only_and_no_duplicate_notifications(client, setup, db):
    _, owner, member, _, headers = setup
    eid = event(client, setup).json()["id"]
    url = f"/api/v1/events/{eid}"
    client.patch(url + "/rsvp", headers=headers(member), json={"response": "accepted"})
    initial = db.scalar(select(func.count()).select_from(Notification))
    same = client.patch(url, headers=headers(owner), json={"start_at": "2028-01-03T09:00:00+08:00"})
    assert same.status_code == 200 and same.json()["participants"][1]["response"] == "accepted"
    client.patch(url, headers=headers(owner), json={"title": "新标题"})
    assert db.scalar(select(func.count()).select_from(Notification)) == initial
    changed = client.patch(url, headers=headers(owner), json={"location": "新地点"})
    assert changed.status_code == 200
    assert changed.json()["participants"][0]["response"] == "accepted"
    assert changed.json()["participants"][1]["needs_confirmation"]
    assert db.scalar(select(func.count()).select_from(Notification)) == initial + 1
    client.patch(url, headers=headers(owner), json={"location": "又一地点"})
    assert db.scalar(select(func.count()).select_from(Notification)) == initial + 1
    mine = client.get(url, headers=headers(member)).json()
    assert mine["my_needs_confirmation"] and mine["my_response"] == "pending"
    client.patch(url + "/rsvp", headers=headers(member), json={"response": "declined"})
    client.patch(url, headers=headers(owner), json={"location": "第三地点"})
    mine = client.get(url, headers=headers(member)).json()
    assert not mine["my_needs_confirmation"] and mine["my_response"] == "declined"


@pytest.mark.parametrize("frequency,count,offset", [("weekly", 4, 7), ("biweekly", 3, 14)])
def test_recurring_create_and_instance_independent_rsvp(client, setup, frequency, count, offset):
    _, owner, member, outsider, headers = setup
    result = event(client, setup, recurrence={"frequency": frequency, "count": count})
    assert result.status_code == 201, result.text
    assert result.json()["series_id"] and result.json()["series_count"] == count
    items = list_events(client, setup)
    assert len(items) == count
    assert (
        datetime.fromisoformat(items[1]["start_at"].replace("Z", "+00:00"))
        - datetime.fromisoformat(items[0]["start_at"].replace("Z", "+00:00"))
    ).days == offset
    client.patch(
        f"/api/v1/events/{items[0]['id']}/rsvp",
        headers=headers(member),
        json={"response": "accepted"},
    )
    assert (
        client.get(f"/api/v1/events/{items[1]['id']}", headers=headers(member)).json()[
            "my_response"
        ]
        == "pending"
    )
    assert (
        client.patch(
            f"/api/v1/events/{items[0]['id']}",
            headers=headers(member),
            json={"title": "不能改", "scope": "all"},
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"/api/v1/events/{items[0]['id']}?scope=all", headers=headers(outsider)
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "rule",
    [
        {"frequency": "weekly"},
        {"frequency": "weekly", "count": 53},
        {"frequency": "weekly", "count": 0},
        {"frequency": "weekly", "count": 3, "until": "2028-02-01"},
        {"frequency": "biweekly", "count": 52},
        {"frequency": "weekly", "until": "2030-01-01"},
    ],
)
def test_recurring_validation_atomic(client, setup, rule, db):
    assert event(client, setup, recurrence=rule).status_code == 422
    assert db.scalar(select(func.count()).select_from(EventSeries)) == 0
    assert db.scalar(select(func.count()).select_from(Event)) == 0


def test_recurring_create_conflict_rolls_back_all_rows_and_notifications(client, setup, db):
    assert (
        event(
            client, setup, start_at="2028-01-10T01:00:00Z", end_at="2028-01-10T02:00:00Z"
        ).status_code
        == 201
    )
    initial = db.scalar(select(func.count()).select_from(Notification))
    result = event(client, setup, recurrence={"frequency": "weekly", "count": 3})
    assert result.status_code == 409
    assert db.scalar(select(func.count()).select_from(Event)) == 1
    assert db.scalar(select(func.count()).select_from(EventSeries)) == 0
    assert db.scalar(select(func.count()).select_from(Notification)) == initial
    assert (
        event(
            client, setup, recurrence={"frequency": "weekly", "count": 3}, ignore_conflicts=True
        ).status_code
        == 201
    )


def test_recurring_scopes_cancelled_exception_and_reconfirmation(client, setup):
    _, owner, member, _, headers = setup
    assert event(client, setup, recurrence={"frequency": "weekly", "count": 4}).status_code == 201
    items = list_events(client, setup)
    client.patch(
        f"/api/v1/events/{items[1]['id']}/rsvp",
        headers=headers(member),
        json={"response": "accepted"},
    )
    cancelled = client.patch(
        f"/api/v1/events/{items[2]['id']}", headers=headers(owner), json={"status": "cancelled"}
    )
    assert cancelled.status_code == 200
    updated = client.patch(
        f"/api/v1/events/{items[1]['id']}",
        headers=headers(owner),
        json={
            "scope": "future",
            "start_at": "2028-01-10T02:00:00Z",
            "end_at": "2028-01-10T03:00:00Z",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["affected_count"] == 2
    fresh = list_events(client, setup)
    assert fresh[0]["start_at"] == items[0]["start_at"]
    assert fresh[1]["participants"][1]["needs_confirmation"]
    assert fresh[2]["status"] == "cancelled" and fresh[2]["start_at"] == items[2]["start_at"]
    assert fresh[3]["start_at"] == "2028-01-24T02:00:00Z"
    assert (
        client.delete(
            f"/api/v1/events/{items[0]['id']}?scope=all", headers=headers(owner)
        ).status_code
        == 204
    )
    assert [x["status"] for x in list_events(client, setup)] == ["cancelled"]


def test_series_patch_conflict_atomic_and_force(client, setup):
    _, owner, _, _, headers = setup
    event(client, setup, recurrence={"frequency": "weekly", "count": 3})
    items = list_events(client, setup)
    event(
        client,
        setup,
        title="外部冲突",
        start_at="2028-01-10T03:00:00Z",
        end_at="2028-01-10T04:00:00Z",
    )
    data = {"scope": "all", "start_at": "2028-01-03T03:00:00Z", "end_at": "2028-01-03T04:00:00Z"}
    url = f"/api/v1/events/{items[0]['id']}"
    assert client.patch(url, headers=headers(owner), json=data).status_code == 409
    assert client.get(url, headers=headers(owner)).json()["start_at"] == items[0]["start_at"]
    assert (
        client.patch(
            url, headers=headers(owner), json={**data, "ignore_conflicts": True}
        ).status_code
        == 200
    )


def test_recurring_dst_wall_clock_and_until(client, setup, db):
    team, _, _, _, headers = setup
    team.timezone = "America/New_York"
    db.commit()
    result = event(
        client,
        setup,
        start_at="2028-03-05T14:00:00Z",
        end_at="2028-03-05T15:00:00Z",
        recurrence={"frequency": "weekly", "until": "2028-03-19"},
    )
    assert result.status_code == 201, result.text
    rows = list(db.scalars(select(Event).order_by(Event.start_at)))
    assert [e.start_at.hour for e in rows] == [14, 13, 13]
    assert len(rows) == 3


def test_dependency_graph_cycle_block_complete_reopen_and_delete(client, setup):
    team, owner, member, outsider, headers = setup
    a = task(client, setup, title="A").json()
    b = task(client, setup, title="B", dependency_ids=[a["id"], a["id"]]).json()
    c = task(client, setup, title="C", dependency_ids=[b["id"]]).json()
    assert b["blocked"] and b["dependency_ids"] == [a["id"]]

    def patch(tid, data):
        return client.patch(f"/api/v1/tasks/{tid}", headers=headers(owner), json=data)

    assert patch(a["id"], {"dependency_ids": [c["id"]]}).json()["code"] == "DEPENDENCY_CYCLE"
    assert patch(a["id"], {"dependency_ids": [a["id"]]}).json()["code"] == "DEPENDENCY_CYCLE"
    assert patch(b["id"], {"status": "doing"}).json()["code"] == "TASK_BLOCKED"
    assert (
        client.post(f"/api/v1/tasks/{b['id']}/complete", headers=headers(member)).status_code == 409
    )
    assert (
        client.post(f"/api/v1/tasks/{a['id']}/complete", headers=headers(member)).status_code == 200
    )
    assert (
        client.post(f"/api/v1/tasks/{b['id']}/complete", headers=headers(member)).status_code == 200
    )
    assert (
        client.post(f"/api/v1/tasks/{a['id']}/reopen", headers=headers(member)).json()["code"]
        == "DEPENDENCY_IN_USE"
    )
    assert client.delete(f"/api/v1/tasks/{a['id']}", headers=headers(owner)).status_code == 409
    graph = client.get(
        f"/api/v1/teams/{team.id}/tasks/dependency-graph", headers=headers(member)
    ).json()
    assert len(graph["nodes"]) == 3 and len(graph["edges"]) == 2
    assert (
        client.get(
            f"/api/v1/teams/{team.id}/tasks/dependency-graph", headers=headers(outsider)
        ).status_code
        == 404
    )
    assert patch(b["id"], {"dependency_ids": []}).status_code == 200
    assert client.delete(f"/api/v1/tasks/{a['id']}", headers=headers(owner)).status_code == 204


def test_dependency_cross_team_permissions_deadline_and_atomic(client, setup, db, team_factory):
    _, owner, member, outsider, headers = setup
    other_team = team_factory(owner=outsider)
    foreign = Task(
        team_id=other_team.id,
        created_by=outsider.id,
        assignee_id=outsider.id,
        title="隔离",
        due_at=datetime(2028, 1, 10, tzinfo=UTC),
    )
    db.add(foreign)
    db.commit()
    a = task(client, setup).json()
    b = task(client, setup, dependency_ids=[a["id"]], due_at="2028-01-01T10:00:00Z").json()
    assert b["dependency_warnings"]
    assert task(client, setup, dependency_ids=[foreign.id]).status_code == 422
    assert (
        client.patch(
            f"/api/v1/tasks/{b['id']}", headers=headers(member), json={"dependency_ids": []}
        ).status_code
        == 403
    )
    result = client.patch(
        f"/api/v1/tasks/{b['id']}",
        headers=headers(owner),
        json={"dependency_ids": [], "status": None},
    )
    assert result.status_code == 422
    # 失败的请求不应真的移除依赖。
    latest = client.get(f"/api/v1/teams/{a['team_id']}/tasks", headers=headers(owner)).json()
    assert next(t for t in latest["items"] if t["id"] == b["id"])["dependency_ids"] == [a["id"]]


def test_parallel_dependency_cycle_writes_do_not_create_a_cycle(client, setup):
    from concurrent.futures import ThreadPoolExecutor

    _, owner, _, _, headers = setup
    a = task(client, setup, title="A").json()["id"]
    b = task(client, setup, title="B").json()["id"]

    def add_edge(child, parent):
        return client.patch(
            f"/api/v1/tasks/{child}", headers=headers(owner), json={"dependency_ids": [parent]}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(add_edge, a, b)
        second = pool.submit(add_edge, b, a)
        assert sorted([first.result(), second.result()]) == [200, 422]


def test_parallel_identical_reschedule_notifies_once(client, setup, db):
    from concurrent.futures import ThreadPoolExecutor

    _, owner, member, _, headers = setup
    eid = event(client, setup).json()["id"]
    url = f"/api/v1/events/{eid}"
    client.patch(url + "/rsvp", headers=headers(member), json={"response": "accepted"})

    def change():
        return client.patch(
            url, headers=headers(owner), json={"location": "同一新地点"}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: change(), range(2)))
    assert results == [200, 200]
    assert (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.type == "event.updated")
        )
        == 1
    )


def test_all_day_recurring_across_dst_and_title_edit_ignores_existing_conflict(client, setup, db):
    team, owner, _, _, headers = setup
    team.timezone = "America/New_York"
    db.commit()
    result = event(
        client,
        setup,
        all_day=True,
        start_at="2028-03-05T05:00:00Z",
        end_at="2028-03-06T05:00:00Z",
        recurrence={"frequency": "weekly", "count": 3},
    )
    assert result.status_code == 201, result.text
    rows = list(db.scalars(select(Event).order_by(Event.start_at)))
    assert (rows[1].end_at - rows[1].start_at).total_seconds() == 23 * 3600
    event(
        client,
        setup,
        start_at="2028-03-05T14:00:00Z",
        end_at="2028-03-05T15:00:00Z",
        ignore_conflicts=True,
    )
    renamed = client.patch(
        f"/api/v1/events/{result.json()['id']}",
        headers=headers(owner),
        json={"title": "仅改名", "scope": "all"},
    )
    assert renamed.status_code == 200, renamed.text


def test_recurring_gap_dst_rolls_back(client, setup, db):
    team, _, _, _, _ = setup
    team.timezone = "America/New_York"
    db.commit()
    result = event(
        client,
        setup,
        start_at="2028-03-05T07:30:00Z",
        end_at="2028-03-05T08:30:00Z",
        recurrence={"frequency": "weekly", "count": 3},
    )
    assert result.status_code == 422
    assert result.json()["code"] == "INVALID_RECURRENCE"
    assert db.scalar(select(func.count()).select_from(Event)) == 0


def test_suggestions_merge_adjacent_and_overlapping_intervals(client, setup):
    # 连续busy合并后，11点是最早的合法开会时间。
    event(client, setup, start_at="2028-01-03T01:00:00Z", end_at="2028-01-03T02:00:00Z")
    event(client, setup, start_at="2028-01-03T02:00:00Z", end_at="2028-01-03T03:00:00Z")
    event(
        client,
        setup,
        start_at="2028-01-03T01:30:00Z",
        end_at="2028-01-03T02:30:00Z",
        ignore_conflicts=True,
    )
    assert suggestions(client, setup).json()["suggestions"][0]["start_at"] == "2028-01-03T03:00:00Z"


def test_rescheduled_event_reminder_uses_new_time_bucket(client, setup, db):
    from datetime import timedelta

    from app.scheduler.reminders import scan_reminders

    _, owner, _, _, headers = setup
    created = event(client, setup).json()
    old = datetime(2028, 1, 3, 1, 0, tzinfo=UTC)
    scan_reminders(db, old - timedelta(minutes=10))
    scan_reminders(db, old - timedelta(minutes=10))
    assert (
        client.patch(
            f"/api/v1/events/{created['id']}",
            headers=headers(owner),
            json={"start_at": "2028-01-03T02:00:00Z", "end_at": "2028-01-03T03:00:00Z"},
        ).status_code
        == 200
    )
    scan_reminders(db, old + timedelta(minutes=50))
    scan_reminders(db, old + timedelta(minutes=50))
    assert (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == owner.id, Notification.type == "event.reminder")
        )
        == 2
    )
