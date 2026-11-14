import { describe, expect, it } from "vitest";

import {
  eventUrgency,
  groupTasksByDay,
  PERSONAL_COLORS,
  personalEventUrgency,
  taskUrgency,
  toPersonalItems,
  type AgendaResponse,
} from "./personalItems";

const now = Date.parse("2026-11-14T12:00:00Z");
const iso = (ms: number) => new Date(now + ms).toISOString();
const hour = 3600 * 1000;
const day = 24 * hour;

describe("个人事件紧急度", () => {
  it("进行中或 2 小时内开始为红", () => {
    expect(personalEventUrgency({ start_at: iso(-hour), end_at: iso(hour) }, now)).toBe("urgent");
    expect(personalEventUrgency({ start_at: iso(hour), end_at: iso(2 * hour) }, now)).toBe("urgent");
    expect(personalEventUrgency({ start_at: iso(3 * hour), end_at: iso(4 * hour) }, now)).toBe("normal");
    expect(personalEventUrgency({ start_at: iso(2 * day), end_at: iso(2 * day + hour) }, now)).toBe("normal");
  });
});

describe("任务紧急度", () => {
  it("逾期/24 小时内红、完成灰、其余绿", () => {
    expect(taskUrgency({ status: "todo", overdue: true, due_at: iso(-day) }, now)).toBe("urgent");
    expect(taskUrgency({ status: "todo", overdue: false, due_at: iso(10 * hour) }, now)).toBe("urgent");
    expect(taskUrgency({ status: "todo", overdue: false, due_at: iso(2 * day) }, now)).toBe("normal");
    expect(taskUrgency({ status: "done", overdue: true, due_at: iso(-day) }, now)).toBe("done");
  });
});

describe("团队活动紧急度", () => {
  it("待回应为蓝，其余为绿", () => {
    const base = { kind: "team_event" as const, start_at: iso(hour), end_at: iso(2 * hour) };
    expect(eventUrgency({ ...base, my_response: "pending" }, now)).toBe("pending");
    expect(eventUrgency({ ...base, my_response: "accepted" }, now)).toBe("normal");
  });
});

const agenda: AgendaResponse = {
  from: iso(-day),
  to: iso(7 * day),
  events: [
    {
      id: "e:31", source_id: 31, kind: "team_event", title: "周会",
      start_at: iso(hour), end_at: iso(2 * hour), all_day: false, location: null,
      team_id: 2, team_name: "软工大作业", my_response: "accepted",
      needs_confirmation: false, status: "confirmed",
    },
    {
      id: "p:12", source_id: 12, kind: "personal", title: "宿舍",
      start_at: iso(3 * hour), end_at: iso(4 * hour), all_day: false, location: "宿舍",
      team_id: null, team_name: null, my_response: null,
      needs_confirmation: false, status: "confirmed",
    },
  ],
  tasks: [
    {
      id: 41, team_id: 3, team_name: "软工大作业", title: "补交报告",
      status: "todo", priority: "high", due_at: iso(-day), overdue: true,
    },
  ],
};

describe("toPersonalItems", () => {
  it("合并活动与任务，带颜色、跳转与副标题", () => {
    const items = toPersonalItems(agenda, now);
    expect(items.map(item => item.id)).toEqual(["t:41", "e:31", "p:12"]);
    const [task, teamEvent, personal] = items;
    expect(task.urgency).toBe("urgent");
    expect(task.href).toBe("/app/teams/3/tasks?task=41");
    expect(teamEvent.urgency).toBe("normal");
    expect(teamEvent.href).toBe("/app/teams/2/events/31");
    expect(teamEvent.subtitle).toContain("软工大作业");
    expect(personal.kind).toBe("event");
    expect(personal.event?.kind).toBe("personal");
    expect(PERSONAL_COLORS[teamEvent.urgency]).toBe("#16a34a");
  });

  it("空输入返回空数组", () => {
    expect(toPersonalItems(undefined, now)).toEqual([]);
  });
});

describe("groupTasksByDay", () => {
  it("按本地日期分组并保持紧急度", () => {
    const groups = groupTasksByDay(agenda, iso => iso.slice(0, 10), now);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks[0].urgency).toBe("urgent");
  });
});
