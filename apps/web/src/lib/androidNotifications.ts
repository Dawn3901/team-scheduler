import type { CalendarEvent, Task } from "@teamsync/shared";

/**
 * Android 本地通知桥：WebView 只负责算出“未来 7 天要提醒什么”，
 * 原生壳负责权限、AlarmManager 排程与通知展示。
 */
export interface AndroidBridge {
  schedule: (teamId: number, kind: "events" | "tasks", payload: string) => string;
  cancel: (teamId: number) => string;
  permission: () => string;
  requestPermission: () => string;
}

export interface AndroidNotificationItem {
  id: string;
  title: string;
  body: string;
  at: number;
  path: string;
  teamId: number;
  kind: "event" | "task";
}

declare global {
  interface Window {
    TeamSyncAndroid?: AndroidBridge;
  }
}

export function getAndroidBridge(): AndroidBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.TeamSyncAndroid ?? null;
}

export interface AndroidScheduleOptions {
  teamId: number;
  userId: number;
  now?: number;
}

const EVENT_LEAD_MS = 15 * 60 * 1000;
const TASK_LEAD_MS = 60 * 60 * 1000;
const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 100;

/**
 * 未来 7 天的活动/任务提醒：
 * - 活动：开始前 15 分钟；只看已确认、本人未拒绝的活动；
 * - 任务：截止前 1 小时；只看未完成且负责人是自己的任务；
 * - 时间点已过去的不补发，避免每次同步都重复弹旧提醒；
 * - id 含开始/截止时间，改期后旧排程会被同 team+kind 的整批替换掉。
 */
export function buildAndroidSchedule(
  events: CalendarEvent[],
  tasks: Task[],
  options: AndroidScheduleOptions,
): AndroidNotificationItem[] {
  const now = options.now ?? Date.now();
  const until = now + HORIZON_MS;
  const items: AndroidNotificationItem[] = [];

  for (const event of events) {
    if (event.status !== "confirmed") {
      continue;
    }
    if (event.my_response === null || event.my_response === "declined") {
      continue;
    }
    const start = Date.parse(event.start_at);
    if (!Number.isFinite(start) || start <= now || start > until) {
      continue;
    }
    const at = start - EVENT_LEAD_MS;
    if (at <= now) {
      continue;
    }
    items.push({
      id: `event:${event.id}:15m:${event.start_at}`,
      title: "活动提醒",
      body: `「${event.title}」将在 15 分钟后开始`,
      at,
      path: `/app/teams/${options.teamId}/events/${event.id}`,
      teamId: options.teamId,
      kind: "event",
    });
  }

  for (const task of tasks) {
    if (task.status === "done" || task.assignee_id !== options.userId) {
      continue;
    }
    const due = Date.parse(task.due_at);
    if (!Number.isFinite(due) || due <= now || due > until) {
      continue;
    }
    const at = due - TASK_LEAD_MS;
    if (at <= now) {
      continue;
    }
    items.push({
      id: `task:${task.id}:1h:${task.due_at}`,
      title: "任务提醒",
      body: `任务「${task.title}」将在 1 小时后截止`,
      at,
      path: `/app/teams/${options.teamId}/tasks?task=${task.id}`,
      teamId: options.teamId,
      kind: "task",
    });
  }

  return items.sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
}
