import type { CalendarEvent, MyTask, Task } from "@teamsync/shared";

/**
 * 日历颜色语义（CAL-6 调整，CR-012 修订）：
 * - 活动：需要参加=蓝、不需要=绿、别人看不到的私密=灰；
 * - 任务：逾期/24 小时内=红、3 天内=黄、正常/已完成=白。
 * 颜色只表达“我要不要处理”，不再按创建者或自定义色区分。
 * 私密只对“看不到详情的人”才是灰色；我自己创建/参与的私密活动我能看到，按蓝色处理。
 */
export const CALENDAR_COLORS = {
  attending: "#2563eb",
  notAttending: "#16a34a",
  private: "#6b7280",
  taskUrgent: "#dc2626",
  taskSoon: "#eab308",
  taskNormal: "#ffffff",
} as const;

export function isPrivateForViewer(
  event: Pick<CalendarEvent, "visibility" | "my_response">,
): boolean {
  // my_response 非空说明我是组织者或仍有效的参与者，此时私密活动对我可见。
  return event.visibility === "private" && event.my_response === null;
}

export function eventColor(event: Pick<CalendarEvent, "visibility" | "my_response">): string {
  if (isPrivateForViewer(event)) {
    return CALENDAR_COLORS.private;
  }
  return event.my_response !== null && event.my_response !== "declined"
    ? CALENDAR_COLORS.attending
    : CALENDAR_COLORS.notAttending;
}

export function taskColor(
  task: Pick<Task, "status" | "overdue" | "due_at"> | Pick<MyTask, "status" | "overdue" | "due_at">,
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

/** 任务紧急程度（CR-012）：逾期/24h 内=urgent、3 天内=soon、其余/完成=normal。 */
export function taskUrgency(
  task: Pick<Task, "status" | "overdue" | "due_at"> | Pick<MyTask, "status" | "overdue" | "due_at">,
  now: number = Date.now(),
): "urgent" | "soon" | "normal" {
  const color = taskColor(task, now);
  if (color === CALENDAR_COLORS.taskUrgent) return "urgent";
  if (color === CALENDAR_COLORS.taskSoon) return "soon";
  return "normal";
}

/** 任务行的浅色底色（与日历同源，保证列表和日历颜色语义一致）。 */
export function taskSurface(color: string): string {
  return `color-mix(in srgb, ${color} 12%, white)`;
}

export function textColorFor(background: string): string {
  return background === CALENDAR_COLORS.taskNormal || background === CALENDAR_COLORS.taskSoon
    ? "#111827"
    : "#ffffff";
}

export function borderColorFor(background: string): string {
  return background === CALENDAR_COLORS.taskNormal ? "#cbd5e1" : background;
}
