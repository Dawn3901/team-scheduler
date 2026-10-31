export interface HealthStatus {
  status: "ok" | "error";
  db: "ok" | "error";
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface UserSummary {
  id: number;
  username: string;
  display_name: string;
  avatar_color: string;
}

export type TeamRole = "owner" | "admin" | "member";

export interface TeamSummary {
  id: number;
  name: string;
  description: string | null;
  invite_code: string;
  owner_id: number;
  timezone: string;
  my_role: TeamRole;
  member_count: number;
}

/** 契约：所有列表都返回 { items, total }，不是裸数组。 */
export interface Paginated<T> {
  items: T[];
  total: number;
}
