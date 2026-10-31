import type { TeamSummary } from "@teamsync/shared";
import { Link } from "react-router-dom";

import { InviteCode } from "./InviteCode";
import { RoleBadge } from "./RoleBadge";

export function TeamCard({ team }: { team: TeamSummary }) {
  return (
    <article className="team-card">
      <div className="team-card-top">
        <h2>{team.name}</h2>
        <RoleBadge role={team.my_role} />
      </div>
      <p className="team-card-desc">{team.description ?? "暂无团队描述"}</p>
      <p className="team-meta">{team.member_count} 位成员</p>
      <InviteCode code={team.invite_code} />
      <Link className="btn btn-secondary btn-block" to={`/app/teams/${team.id}/calendar`}>
        进入团队
      </Link>
    </article>
  );
}
