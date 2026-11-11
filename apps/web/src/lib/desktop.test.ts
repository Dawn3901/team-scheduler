import { describe, expect, it } from "vitest";

import { desktopTargetPath, isSystemNotificationType } from "./desktop";

describe("desktopTargetPath", () => {
  it("优先打开活动详情", () => {
    expect(desktopTargetPath({ teamId: 3, eventId: 9, taskId: 4 })).toBe(
      "/app/teams/3/events/9",
    );
  });

  it("任务带 task 查询参数以便高亮", () => {
    expect(desktopTargetPath({ teamId: 3, taskId: 4 })).toBe("/app/teams/3/tasks?task=4");
  });

  it("只有团队时回到团队首页，空目标不导航", () => {
    expect(desktopTargetPath({ teamId: 3 })).toBe("/app/teams/3");
    expect(desktopTargetPath({})).toBeNull();
    expect(desktopTargetPath(null)).toBeNull();
  });

  it("忽略非法 id", () => {
    expect(desktopTargetPath({ teamId: 0, eventId: 1 })).toBeNull();
    expect(desktopTargetPath({ teamId: 1.5, eventId: 1 })).toBeNull();
  });
});

describe("isSystemNotificationType", () => {
  it("只有到点提醒弹系统通知", () => {
    expect(isSystemNotificationType("event.reminder")).toBe(true);
    expect(isSystemNotificationType("task.due_soon")).toBe(true);
    expect(isSystemNotificationType("task.overdue")).toBe(true);
    expect(isSystemNotificationType("event.invited")).toBe(false);
    expect(isSystemNotificationType("event.updated")).toBe(false);
  });
});
