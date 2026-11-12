import type { CalendarEvent, Task } from "@teamsync/shared";
import { describe, expect, it } from "vitest";

import {
  CALENDAR_COLORS,
  eventColor,
  isPrivateForViewer,
  taskColor,
  textColorFor,
} from "./calendarColors";

const event = (overrides: Partial<CalendarEvent> = {}): Pick<CalendarEvent, "visibility" | "my_response"> => ({
  visibility: "team",
  my_response: "accepted",
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Pick<Task, "status" | "overdue" | "due_at"> => ({
  status: "todo",
  overdue: false,
  due_at: "2026-11-20T12:00:00Z",
  ...overrides,
});

const now = Date.parse("2026-11-11T12:00:00Z");

describe("eventColor", () => {
  it("需要参加为蓝色，未邀请/已拒绝为绿色", () => {
    expect(eventColor(event())).toBe(CALENDAR_COLORS.attending);
    expect(eventColor(event({ my_response: "declined" }))).toBe(CALENDAR_COLORS.notAttending);
    expect(eventColor(event({ my_response: null }))).toBe(CALENDAR_COLORS.notAttending);
  });

  it("我创建或参与的私密活动按蓝色算个人活动，看不到详情的私密才是灰色", () => {
    expect(eventColor(event({ visibility: "private", my_response: "accepted" }))).toBe(
      CALENDAR_COLORS.attending,
    );
    expect(eventColor(event({ visibility: "private", my_response: "tentative" }))).toBe(
      CALENDAR_COLORS.attending,
    );
    expect(eventColor(event({ visibility: "private", my_response: null }))).toBe(
      CALENDAR_COLORS.private,
    );
    expect(isPrivateForViewer(event({ visibility: "private", my_response: "accepted" }))).toBe(false);
    expect(isPrivateForViewer(event({ visibility: "private", my_response: null }))).toBe(true);
    expect(isPrivateForViewer(event())).toBe(false);
  });
});

describe("taskColor", () => {
  it("逾期/24 小时内红色，3 天内黄色，正常白色，已完成白色", () => {
    expect(taskColor(task({ overdue: true }), now)).toBe(CALENDAR_COLORS.taskUrgent);
    expect(taskColor(task({ due_at: "2026-11-12T06:00:00Z" }), now)).toBe(CALENDAR_COLORS.taskUrgent);
    expect(taskColor(task({ due_at: "2026-11-13T12:00:00Z" }), now)).toBe(CALENDAR_COLORS.taskSoon);
    expect(taskColor(task({ due_at: "2026-11-20T12:00:00Z" }), now)).toBe(CALENDAR_COLORS.taskNormal);
    expect(taskColor(task({ status: "done", overdue: true }), now)).toBe(CALENDAR_COLORS.taskNormal);
  });
});

describe("textColorFor", () => {
  it("浅色背景用深色文字", () => {
    expect(textColorFor(CALENDAR_COLORS.taskNormal)).toBe("#111827");
    expect(textColorFor(CALENDAR_COLORS.taskSoon)).toBe("#111827");
    expect(textColorFor(CALENDAR_COLORS.attending)).toBe("#ffffff");
  });
});
