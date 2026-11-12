import type { Paginated } from "../types";
import { request } from "./client";

/** CR-002 / CAL-9：用户级个人日历；只对当前 token 的 owner 可见。 */
export interface PersonalEvent {
  id: number; title: string; description: string | null;
  start_at: string; end_at: string; all_day: boolean;
  location: string | null; color: string | null; share_busy: boolean; updated_at: string;
}
export interface PersonalEventInput {
  title: string; description?: string | null; start_at: string; end_at: string;
  all_day: boolean; location?: string | null; color?: string | null; share_busy: boolean;
}

export const listPersonalEvents = (from: string, to: string) =>
  request<Paginated<PersonalEvent>>(`/me/calendar?${new URLSearchParams({ from, to })}`);
export const createPersonalEvent = (data: PersonalEventInput) =>
  request<PersonalEvent>("/me/events", { method: "POST", body: JSON.stringify(data) });
export const updatePersonalEvent = (id: number, data: Partial<PersonalEventInput>) =>
  request<PersonalEvent>(`/me/events/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deletePersonalEvent = (id: number) =>
  request<void>(`/me/events/${id}`, { method: "DELETE" });

/** CR-011：跨团队“我参加的团队活动”只读视图（attending=已接受/待定，invites=待回应）。 */
export interface MyTeamEvent {
  id: number; team_id: number; team_name: string; title: string;
  start_at: string; end_at: string; all_day: boolean; location: string | null;
  visibility: "team" | "private"; my_response: "pending" | "accepted" | "declined" | "tentative";
  needs_confirmation: boolean; local_date: string;
}
export interface MyTeamEvents {
  attending: MyTeamEvent[]; invites: MyTeamEvent[];
}

export const listMyTeamEvents = (from: string, to: string) =>
  request<MyTeamEvents>(`/me/team-events?${new URLSearchParams({ from, to })}`);
