import { useQuery } from "@tanstack/react-query";
import { changeRole, listMembers, removeMember } from "@teamsync/shared";
import { useParams } from "react-router-dom";
import { useTeam } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";
import { RoleBadge } from "../components/RoleBadge";
import { friendlyMessage } from "../lib/errors";

export default function MembersPage() {
  const id = Number(useParams().teamId);
  const team = useTeam(id).data;
  const members = useQuery({queryKey: ["members", id], queryFn: () => listMembers(id)});
  const action = useAction();
  return <section className="panel members-panel">
    <div className="page-head compact">
      <div>
        <p className="eyebrow">团队空间</p>
        <h2>团队成员</h2>
        <p className="muted">{members.data?.items.length ?? 0} 位成员 · 管理角色与邀请码加入</p>
      </div>
    </div>
    {members.isError && <p role="alert">{friendlyMessage(members.error)}</p>}
    {members.isPending && <p>成员加载中…</p>}
    <div className="member-grid">
      {members.data?.items.map(m => <article className="member-card" key={m.user_id}>
        <span className="member-avatar" aria-hidden="true">{Array.from(m.display_name)[0] ?? "?"}</span>
        <div className="member-main">
          <div className="member-name"><strong>{m.display_name}</strong><RoleBadge role={m.role} /></div>
          <p className="muted">加入于 {m.joined_at.slice(0,10)}</p>
        </div>
        <div className="member-actions">
          {team?.my_role === "owner" && m.role !== "owner" && <button className="btn btn-secondary btn-sm" disabled={action.pending} onClick={() => void action.run(() => changeRole(id, m.user_id, m.role === "admin" ? "member" : "admin")).catch(() => {})}>{m.role === "admin" ? "取消管理员" : "设为管理员"}</button>}
          {team?.my_role !== "member" && m.role !== "owner" && <button className="btn btn-ghost btn-sm" disabled={action.pending} onClick={() => {if(window.confirm(`确定移除 ${m.display_name}？未完成任务将待重新指派。`)) void action.run(() => removeMember(id, m.user_id)).catch(() => {});}}>移除</button>}
        </div>
      </article>)}
    </div>
    {members.isError && <button className="btn btn-secondary" onClick={() => void members.refetch()}>重试</button>}
  </section>;
}
