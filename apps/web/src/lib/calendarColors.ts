import type { CalendarEvent, Task } from "@teamsync/shared";

/**
 * 日历颜色语义（CAL-6 调整）：
 * - 活动：需要参加=蓝、不需要=绿、私密=灰；
 * - 任务：逾期/24 小时内=红、3 天内=黄、正常/已完成=白。
 * 颜色只表达“我要不要处理”，不再按创建者或自定义色区分。
 */
export const CALENDAR_COLORS = {
  attending: "#2563eb",
  notAttending: "#16a34a",
  private: "#6b7280",
  taskUrgent: "#dc2626",
  taskSoon: "#eab308",
  taskNormal: "#ffffff",
} as const;

export function eventColor(event: Pick<CalendarEvent, "visibility" | "my_response">): string {
  if (event.visibility === "private") {
    return CALENDAR_COLORS.private;
  }
  return event.my_response !== null && event.my_response !== "declined"
    ? CALENDAR_COLORS.attending
    : CALENDAR_COLORS.notAttending;
}

export function taskColor(
  task: Pick<Task, "status" | "overdue" | "due_at">,
  now: number = Date.now(),
): string {
  if (task.status === "done") {
    return CALENDAR_COLORS.taskNormal;
  }
  if (task.overdue) {
    return CALENDAR_COLORS.taskUrgent;
  }
  const due = Date.parse(task.due_at);
  if (!Number.isFinite(due)) {
    return CALENDAR_COLORS.taskNormal;
  }
  const remaining = due - now;
  if (remaining <= 24 * 60 * 60 * 1000) {
    return CALENDAR_COLORS.taskUrgent;
  }
  if (remaining <= 72 * 60 * 60 * 1000) {
    return CALENDAR_COLORS.taskSoon;
  }
  return CALENDAR_COLORS.taskNormal;
}

export function textColorFor(background: string): string {
  return background === CALENDAR_COLORS.taskNormal || background === CALENDAR_COLORS.taskSoon
    ? "#111827"
    : "#ffffff";
}

export function borderColorFor(background: string): string {
  return background === CALENDAR_COLORS.taskNormal ? "#cbd5e1" : background;
}
