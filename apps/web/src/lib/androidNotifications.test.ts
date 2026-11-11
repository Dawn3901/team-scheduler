import type { CalendarEvent, Task } from "@teamsync/shared";
import { describe, expect, it } from "vitest";

import { buildAndroidSchedule } from "./androidNotifications";

const now = Date.parse("2026-11-11T04:00:00Z");

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    team_id: 7,
    title: "需求评审",
    description: null,
    start_at: "2026-11-11T06:00:00Z",
    end_at: "2026-11-11T07:00:00Z",
    all_day: false,
    location: null,
    color: null,
    visibility: "team",
    status: "confirmed",
    created_by: 1,
    updated_at: "2026-11-10T00:00:00Z",
    my_response: "accepted",
    participants: [],
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 5,
    team_id: 7,
    title: "完成概要设计",
    description: null,
    assignee_id: 21,
    assignee_name: "林",
    created_by: 1,
    due_at: "2026-11-11T09:00:00Z",
    priority: "normal",
    status: "todo",
    overdue: false,
    completed_at: null,
    updated_at: "2026-11-10T00:00:00Z",
    ...overrides,
  };
}

const options = { teamId: 7, userId: 21, now };

describe("buildAndroidSchedule", () => {
  it("活动提前 15 分钟、任务提前 1 小时", () => {
    const items = buildAndroidSchedule([event()], [task()], options);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "event:1:15m:2026-11-11T06:00:00Z",
      at: Date.parse("2026-11-11T05:45:00Z"),
      path: "/app/teams/7/events/1",
      kind: "event",
    });
    expect(items[1]).toMatchObject({
      id: "task:5:1h:2026-11-11T09:00:00Z",
      at: Date.parse("2026-11-11T08:00:00Z"),
      path: "/app/teams/7/tasks?task=5",
      kind: "task",
    });
  });

  it("跳过拒绝/未邀请/取消的活动，以及别人的/已完成的任务", () => {
    const items = buildAndroidSchedule(
      [
        event({ id: 1, my_response: "declined" }),
        event({ id: 2, my_response: null }),
        event({ id: 3, status: "cancelled" }),
      ],
      [
        task({ id: 4, assignee_id: 99 }),
        task({ id: 5, status: "done" }),
      ],
      options,
    );
    expect(items).toEqual([]);
  });

  it("不补发已经过去的提醒，也不排 7 天之外", () => {
    const items = buildAndroidSchedule(
      [
        event({ id: 1, start_at: "2026-11-11T04:10:00Z", end_at: "2026-11-11T05:10:00Z" }),
        event({ id: 2, start_at: "2026-11-20T06:00:00Z", end_at: "2026-11-20T07:00:00Z" }),
      ],
      [task({ due_at: "2026-11-11T04:30:00Z" })],
      options,
    );
    expect(items).toEqual([]);
  });

  it("改期后 id 变化，便于整批替换旧排程", () => {
    const first = buildAndroidSchedule([event()], [], options);
    const moved = buildAndroidSchedule(
      [event({ start_at: "2026-11-11T07:00:00Z", end_at: "2026-11-11T08:00:00Z" })],
      [],
      options,
    );
    expect(first[0].id).not.toBe(moved[0].id);
    expect(moved[0].at).toBe(Date.parse("2026-11-11T06:45:00Z"));
  });

  it("按时间排序", () => {
    const items = buildAndroidSchedule(
      [event(), event({ id: 2, start_at: "2026-11-11T05:00:00Z", end_at: "2026-11-11T06:00:00Z" })],
      [task({ due_at: "2026-11-11T08:00:00Z" })],
      options,
    );
    expect(items.map((item) => item.at)).toEqual([...items.map((item) => item.at)].sort((a, b) => a - b));
  });
});
