import type { PersonalEvent } from "@teamsync/shared";

/**
 * CR-013：个人日历条目与颜色（红=紧急、蓝=活动待回应、绿=正常、灰=完成）。
 * 阈值集中在这里，日历与任务清单共用，避免两套口径。
 */
export type AgendaKind = "personal" | "team_event";
export type PersonalUrgency = "urgent" | "pending" | "normal" | "done";

export interface AgendaEvent {
  id: string;
  source_id: number;
  kind: AgendaKind;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  team_id: number | null;
  team_name: string | null;
  my_response: "pending" | "accepted" | "declined" | "tentative" | null;
  needs_confirmation: boolean;
  status: "confirmed" | "cancelled";
}

export interface AgendaTask {
  id: number;
  team_id: number;
  team_name: string;
  title: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "normal" | "high";
  due_at: string;
  overdue: boolean;
}

export interface AgendaResponse {
  from: string;
  to: string;
  events: AgendaEvent[];
  tasks: AgendaTask[];
}

export const PERSONAL_COLORS = {
  urgent: "#dc2626",
  pending: "#2563eb",
  normal: "#16a34a",
  done: "#94a3b8",
} as const;

/** 个人事件：进行中或 2 小时内开始算紧急。 */
export const PERSONAL_EVENT_URGENT_MS = 2 * 60 * 60 * 1000;
/** 任务：24 小时内截止算紧急。 */
export const TASK_URGENT_MS = 24 * 60 * 60 * 1000;

export function personalEventUrgency(
  event: Pick<AgendaEvent, "start_at" | "end_at">,
  now: number = Date.now(),
): PersonalUrgency {
  const start = Date.parse(event.start_at);
  const end = Date.parse(event.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "normal";
  if (start <= now && end >= now) return "urgent";
  return start - now <= PERSONAL_EVENT_URGENT_MS ? "urgent" : "normal";
}

export function taskUrgency(
  task: Pick<AgendaTask, "status" | "overdue" | "due_at">,
  now: number = Date.now(),
): PersonalUrgency {
  if (task.status === "done") return "done";
  if (task.overdue) return "urgent";
  const due = Date.parse(task.due_at);
  if (!Number.isFinite(due)) return "normal";
  return due - now <= TASK_URGENT_MS ? "urgent" : "normal";
}

export function eventUrgency(
  event: Pick<AgendaEvent, "kind" | "my_response" | "start_at" | "end_at">,
  now: number = Date.now(),
): PersonalUrgency {
  if (event.kind === "team_event") {
    return event.my_response === "pending" ? "pending" : "normal";
  }
  return personalEventUrgency(event, now);
}

export function urgencyColor(urgency: PersonalUrgency): string {
  return PERSONAL_COLORS[urgency];
}

export interface PersonalItem {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  urgency: PersonalUrgency;
  kind: "event" | "task";
  href?: string;
  subtitle?: string;
  event?: AgendaEvent;
  task?: AgendaTask;
}

/** 把 /me/agenda 的响应映射成日历/列表统一的条目。 */
export function toPersonalItems(
  agenda: AgendaResponse | undefined,
  now: number = Date.now(),
): PersonalItem[] {
  if (!agenda) return [];
  const items: PersonalItem[] = agenda.events.map(event => ({
    id: event.id,
    title: event.title,
    start: event.start_at,
    end: event.end_at,
    allDay: event.all_day,
    urgency: eventUrgency(event, now),
    kind: "event",
    href: event.kind === "team_event" ? `/app/teams/${event.team_id}/events/${event.source_id}` : undefined,
    subtitle:
      event.kind === "team_event"
        ? `${event.team_name ?? "团队"}${event.my_response === "pending" ? " · 待回应" : ""}`
        : "个人日程",
    event,
  }));
  for (const task of agenda.tasks) {
    items.push({
      id: `t:${task.id}`,
      title: task.title,
      start: task.due_at,
      end: task.due_at,
      allDay: true,
      urgency: taskUrgency(task, now),
      kind: "task",
      href: `/app/teams/${task.team_id}/tasks?task=${task.id}`,
      subtitle: `截止 · ${task.team_name}${task.overdue ? " · 已逾期" : ""}`,
      task,
    });
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

/** 任务清单视图：按本地日期分组，只含任务；日期升序。 */
export function groupTasksByDay(
  agenda: AgendaResponse | undefined,
  localDate: (iso: string) => string,
  now: number = Date.now(),
): { day: string; tasks: { task: AgendaTask; urgency: PersonalUrgency }[] }[] {
  if (!agenda) return [];
  const map = new Map<string, { task: AgendaTask; urgency: PersonalUrgency }[]>();
  for (const task of agenda.tasks) {
    const day = localDate(task.due_at);
    const list = map.get(day) ?? [];
    list.push({ task, urgency: taskUrgency(task, now) });
    map.set(day, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, tasks]) => ({
      day,
      tasks: tasks.sort((a, b) => a.task.due_at.localeCompare(b.task.due_at)),
    }));
}

export type { PersonalEvent };
