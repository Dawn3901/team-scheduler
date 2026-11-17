import { describe, expect, it } from "vitest";

import { groupLabel, groupNotices, KNOWN_NOTIFICATION_TYPES, type NoticeGroup } from "./noticeGroups";
import type { Notice } from "@teamsync/shared";

/** 后端实际会发出的全部通知类型（docs/ai/02 与 server/app 保持一致）。 */
const BACKEND_TYPES = [
  "event.invited",
  "event.updated",
  "event.cancelled",
  "event.reminder",
  "rsvp.updated",
  "task.assigned",
  "task.updated",
  "task.due_soon",
  "task.overdue",
  "message.mentioned",
  "message.created",
  "announcement.published",
];

function notice(overrides: Partial<Notice> & { id: number; type: string }): Notice {
  return {
    title: "标题",
    body: null,
    payload: {},
    read_at: null,
    created_at: "2026-11-17T02:00:00Z",
    ...overrides,
  } as Notice;
}

describe("通知展示名（CR-016）", () => {
  it("后端每种类型都有中文名，不会把代码直接显示给用户", () => {
    for (const type of BACKEND_TYPES) {
      const label = groupLabel(type);
      expect(label, `${type} 缺少展示名`).not.toBe(type);
      expect(label).not.toMatch(/[a-z]+\.[a-z_]+/);
    }
    expect([...BACKEND_TYPES].sort()).toEqual([...KNOWN_NOTIFICATION_TYPES].sort());
  });

  it("未知类型兜底为“通知”", () => {
    expect(groupLabel("message.reaction")).toBe("通知");
  });
});

describe("通知分组", () => {
  it("同一条通告的多条通知合并为一组", () => {
    const groups: NoticeGroup[] = groupNotices([
      notice({ id: 2, type: "announcement.published", payload: { team_id: 1, announcement_id: 9 } }),
      notice({ id: 1, type: "announcement.published", payload: { team_id: 1, announcement_id: 9 } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].typeLabel).toBe("新通告");
  });

  it("不同对象不合并；无对象目标的通知各自成组", () => {
    const groups = groupNotices([
      notice({ id: 3, type: "message.mentioned", payload: { team_id: 1, task_id: 5 } }),
      notice({ id: 2, type: "message.mentioned", payload: { team_id: 1, task_id: 6 } }),
      notice({ id: 1, type: "system.message" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[2].typeLabel).toBe("通知");
  });
});
