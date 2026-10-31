import type { TeamRole } from "@teamsync/shared";

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "管理员",
  member: "成员",
};

export function RoleBadge({ role }: { role: TeamRole }) {
  return <span className={`badge badge-${role}`}>{ROLE_LABELS[role]}</span>;
}
