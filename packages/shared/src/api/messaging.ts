import type { Paginated } from "../types";
import { request } from "./client";

/** CR-016 / MSG-1：对象内消息；kind 只影响展示，不影响可见性。 */
export type MessageKind =
  | "comment"
  | "note"
  | "requirement"
  | "blocker"
  | "unblock"
  | "handoff"
  | "change_reason";
export type MessageTarget = "event" | "task" | "announcement";

export interface CollaborationMessage {
  id: number;
  target_type: MessageTarget;
  target_id: number;
  kind: MessageKind;
  body: string;
  author: { user_id: number; display_name: string; avatar_url?: string | null };
  mention_user_ids: number[];
  created_at: string;
}

export interface MessagePage {
  items: CollaborationMessage[];
  has_more: boolean;
  next_before_id: number | null;
}

export interface MessageInput {
  body: string;
  kind?: MessageKind;
  mention_user_ids?: number[];
}

const send = <T>(path: string, method: string, body?: unknown) =>
  request<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const listEventMessages = (eventId: number, beforeId?: number | null) =>
  request<MessagePage>(
    `/events/${eventId}/messages?limit=50${beforeId ? `&before_id=${beforeId}` : ""}`,
  );

export const createEventMessage = (eventId: number, data: MessageInput) =>
  send<CollaborationMessage>(`/events/${eventId}/messages`, "POST", data);

export const listTaskMessages = (taskId: number, beforeId?: number | null) =>
  request<MessagePage>(
    `/tasks/${taskId}/messages?limit=50${beforeId ? `&before_id=${beforeId}` : ""}`,
  );

export const createTaskMessage = (taskId: number, data: MessageInput) =>
  send<CollaborationMessage>(`/tasks/${taskId}/messages`, "POST", data);

export interface Announcement {
  id: number;
  team_id: number;
  title: string;
  body: string;
  pinned: boolean;
  requires_ack: boolean;
  acked: boolean;
  ack_count: number;
  member_count: number;
  expires_at: string | null;
  expired?: boolean;
  created_at: string;
  can_manage?: boolean;
  author: { user_id: number; display_name: string; avatar_url?: string | null };
}

export interface AnnouncementInput {
  title: string;
  body: string;
  pinned?: boolean;
  requires_ack?: boolean;
  expires_at?: string | null;
}

export const listAnnouncements = (teamId: number, offset = 0) =>
  request<Paginated<Announcement> & { unacked_count: number }>(
    `/teams/${teamId}/announcements?limit=20&offset=${offset}`,
  );
export const getAnnouncement = (id: number) => request<Announcement>(`/announcements/${id}`);
export const createAnnouncement = (teamId: number, data: AnnouncementInput) =>
  send<Announcement>(`/teams/${teamId}/announcements`, "POST", data);
export const updateAnnouncement = (id: number, data: Partial<AnnouncementInput>) =>
  send<Announcement>(`/announcements/${id}`, "PATCH", data);
export const deleteAnnouncement = (id: number) => send<void>(`/announcements/${id}`, "DELETE");
export const ackAnnouncement = (id: number) => send<Announcement>(`/announcements/${id}/ack`, "POST");

export interface AnnouncementReceipt {
  items: Array<{
    user_id: number;
    display_name: string;
    avatar_url?: string | null;
    acked: boolean;
    acked_at: string | null;
  }>;
  total: number;
  acked_count: number;
}
export const announcementReceipts = (id: number) =>
  request<AnnouncementReceipt>(`/announcements/${id}/receipts`);

export interface InboxItem {
  kind: "announcement" | "mention" | "message";
  target_type: MessageTarget;
  target_id: number;
  team_id: number;
  title: string;
  preview: string;
  created_at: string;
  unread?: number;
  announcement?: Announcement;
  message?: CollaborationMessage;
}
export interface Inbox {
  items: InboxItem[];
  total: number;
  counts: { announcements: number; mentions: number; messages: number };
}
export const fetchInbox = () => request<Inbox>("/inbox");

/** MSG-3：推进对象读位（收件箱与未读圆点唯一来源）。 */
export const markRead = (target: MessageTarget, targetId: number) =>
  send<void>("/read-marks", "POST", { target_type: target, target_id: targetId });

/** NOTE-1：组织者给某个参与者的备注。 */
export const updateParticipantNote = (eventId: number, userId: number, note: string) =>
  send<{ user_id: number; note: string | null }>(
    `/events/${eventId}/participants/${userId}`,
    "PATCH",
    { note },
  );
