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

export interface TeamSummary {
  id: number;
  name: string;
  description: string | null;
  invite_code: string;
  owner_id: number;
  timezone: string;
  my_role: "owner" | "admin" | "member";
  member_count: number;
}
