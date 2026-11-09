import type { Paginated, TeamRole, UserSummary } from "../types";
import { request } from "./client";

export interface Member {
  user_id: number; display_name: string; role: TeamRole; joined_at: string;
}
export type Rsvp = "pending" | "accepted" | "declined" | "tentative";
export type EventScope = "this" | "future" | "all";
export interface Recurrence { frequency: "weekly" | "biweekly"; count?: number; until?: string; }
export interface Participant {
  needs_confirmation?: boolean;
  user_id: number; display_name: string; response: Rsvp; is_organizer: boolean;
}
export interface CalendarEvent {
  series_id?: number | null; original_start?: string | null; series_count?: number;
  my_needs_confirmation?: boolean;
  id: number; team_id: number; title: string; description: string | null;
  start_at: string; end_at: string; all_day: boolean; location: string | null;
  color: string | null; visibility: "team" | "private"; status: "confirmed" | "cancelled";
  created_by: number; updated_at: string; my_response: Rsvp | null; participants: Participant[];
}
export interface EventInput {
  recurrence?: Recurrence;
  title: string; description?: string | null; start_at: string; end_at: string;
  all_day: boolean; location?: string | null; color?: string | null;
  visibility: "team" | "private"; participant_ids: number[]; ignore_conflicts?: boolean;
}
export interface Task {
  dependency_ids?: number[]; blocked_by?: number[]; blocked?: boolean; dependency_warnings?: string[];
  id: number; team_id: number; title: string; description: string | null;
  assignee_id: number | null; assignee_name: string | null; created_by: number;
  due_at: string; priority: "low" | "normal" | "high"; status: "todo" | "doing" | "done";
  overdue: boolean; completed_at: string | null; updated_at: string;
}
export interface TaskInput {
  dependency_ids?: number[];
  title: string; description?: string | null; assignee_id: number; due_at: string;
  priority: Task["priority"];
}
export interface BusyBlock {
  start_at: string; end_at: string; all_day: boolean; busy: boolean;
  event_id: number | null; title: string | null; visibility: "team" | "private";
}
export interface Availability {
  from: string; to: string;
  members: { user_id: number; display_name: string; blocks: BusyBlock[] }[];
}
export interface Notice {
  id: number; type: string; title: string; body: string | null;
  payload: { team_id?: number; event_id?: number; task_id?: number };
  read_at: string | null; created_at: string;
}
const send = <T>(path: string, method: string, body?: unknown) =>
  request<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** 自动翻页，日历和成员不能因为默认 limit=20 而静默漏数据。 */
async function allPages<T>(path: string): Promise<Paginated<T>> {
  const items: T[] = [];
  let total = 0;
  do {
    const page = await request<Paginated<T>>(`${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${items.length}`);
    items.push(...page.items); total = page.total;
    if (!page.items.length) break;
  } while (items.length < total);
  return { items, total };
}
export const listMembers = (id: number) => allPages<Member>(`/teams/${id}/members`);
export const changeRole = (id: number, uid: number, role: "admin" | "member") => send<Member>(`/teams/${id}/members/${uid}`, "PATCH", { role });
export const removeMember = (id: number, uid: number) => send<void>(`/teams/${id}/members/${uid}`, "DELETE");
export const leaveTeam = (id: number) => send<void>(`/teams/${id}/leave`, "POST");
export const deleteTeam = (id: number) => send<void>(`/teams/${id}`, "DELETE");
export const rotateCode = (id: number) => send<{invite_code: string}>(`/teams/${id}/invite-code/rotate`, "POST");
export const listEvents = (id: number, from: string, to: string, member?: number) => allPages<CalendarEvent>(`/teams/${id}/events?${new URLSearchParams({ from, to, ...(member ? {member_ids: String(member)} : {}) })}`);
export const getEvent = (id: number) => request<CalendarEvent>(`/events/${id}`);
export const createEvent = (id: number, data: EventInput) => send<CalendarEvent>(`/teams/${id}/events`, "POST", data);
export const updateEvent = (id: number, data: Partial<Omit<EventInput, "participant_ids" | "recurrence">> & {status?: "cancelled"; scope?: EventScope}) => send<CalendarEvent>(`/events/${id}`, "PATCH", data);
export const deleteEvent = (id: number, scope: EventScope = "this") => send<void>(`/events/${id}?scope=${scope}`, "DELETE");
export const inviteParticipants = (id: number, user_ids: number[]) => send<Paginated<Participant>>(`/events/${id}/participants`, "POST", { user_ids });
export const removeParticipant = (id: number, uid: number) => send<void>(`/events/${id}/participants/${uid}`, "DELETE");
export const respond = (id: number, response: Exclude<Rsvp, "pending">) => send<Participant>(`/events/${id}/rsvp`, "PATCH", { response });
export const getAvailability = (id: number, from: string, to: string, member?: number) => request<Availability>(`/teams/${id}/availability?${new URLSearchParams({from, to, ...(member ? {user_ids: String(member)} : {})})}`);
export const listTasks = (id: number, filters: {status?: string; assignee_id?: string; mine?: string} = {}) => allPages<Task>(`/teams/${id}/tasks?${new URLSearchParams(filters)}`);
export const createTask = (id: number, data: TaskInput) => send<Task>(`/teams/${id}/tasks`, "POST", data);
export const updateTask = (id: number, data: Partial<TaskInput> & {status?: Task["status"]}) => send<Task>(`/tasks/${id}`, "PATCH", data);
export const completeTask = (id: number) => send<Task>(`/tasks/${id}/complete`, "POST");
export const reopenTask = (id: number) => send<Task>(`/tasks/${id}/reopen`, "POST");
export const deleteTask = (id: number) => send<void>(`/tasks/${id}`, "DELETE");
export const listNotifications = (offset = 0, unread = false) => request<Paginated<Notice> & {unread_count: number}>(`/notifications?limit=20&offset=${offset}&unread_only=${unread}`);
export const readNotification = (id: number) => send<void>(`/notifications/${id}/read`, "POST");
export const readAllNotifications = () => send<void>("/notifications/read-all", "POST");
export const updateProfile = (data: {display_name: string; avatar_color: string}) => send<UserSummary>("/auth/me", "PATCH", data);


export interface TimeSuggestion {
  start_at: string; end_at: string; score: number; required_free: boolean;
  available_member_ids: number[]; missing_optional_ids: number[]; reasons: string[];
}
export interface SuggestionInput {
  from: string; to: string; duration_minutes: number; member_ids: number[]; required_ids: number[];
  work_start: string; work_end: string; buffer_minutes: number; include_weekend: boolean;
}
export function suggestTimes(id: number, input: SuggestionInput) {
  const query = new URLSearchParams(Object.entries(input).map(([key,value]) =>
    [key, Array.isArray(value) ? value.join(",") : String(value)]));
  return request<{suggestions: TimeSuggestion[]}>(`/teams/${id}/availability/suggestions?${query}`);
}
export interface DependencyGraph {
  nodes: {id: number; title: string; status: Task["status"]; blocked: boolean; dependency_ids: number[]}[];
  edges: {from: number; to: number}[];
}
export const getDependencyGraph = (id: number) => request<DependencyGraph>(`/teams/${id}/tasks/dependency-graph`);
