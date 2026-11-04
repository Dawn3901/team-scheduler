import { deleteTeam, leaveTeam, rotateCode } from "@teamsync/shared";
import { useNavigate, useParams } from "react-router-dom";
import { useTeam } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";

export default function SettingsPage() {
  const id = Number(useParams().teamId);
  const team = useTeam(id).data;
  const action = useAction();
  const navigate = useNavigate();
  return <section className="panel settings-panel">
    <div className="page-head compact">
      <div>
        <p className="eyebrow">团队空间</p>
        <h2>团队设置</h2>
        <p className="muted">团队资料、邀请码与成员权限。</p>
      </div>
    </div>
    <div className="settings-grid">
      <article className="setting-card">
        <h3>团队信息</h3>
        <dl className="setting-list">
          <div><dt>团队名称</dt><dd>{team?.name}</dd></div>
          <div><dt>描述</dt><dd>{team?.description || "暂无"}</dd></div>
          <div><dt>时区</dt><dd>{team?.timezone}</dd></div>
        </dl>
        <p className="muted">所有时间均按团队时区显示。</p>
      </article>

      <article className="setting-card">
        <h3>邀请码</h3>
        <p className="setting-code">{team?.invite_code}</p>
        <p className="muted">轮换后旧邀请码立即失效。</p>
        {team?.my_role !== "member" && <button className="btn btn-secondary" disabled={action.pending} onClick={() => { if(window.confirm("轮换后旧邀请码立即失效，确定继续？")) void action.run(() => rotateCode(id)).catch(() => {}); }}>轮换邀请码</button>}
      </article>

      <article className="setting-card danger-zone">
        <h3>{team?.my_role === "owner" ? "危险操作" : "退出团队"}</h3>
        <p className="muted">{team?.my_role === "owner" ? "删除后成员将立即失去访问权限。" : "退出后，未完成任务将待重新指派。"}</p>
        {team?.my_role === "owner" ? <button className="btn btn-danger" disabled={action.pending} onClick={() => {if(window.confirm("确定删除整个团队？成员将立即失去访问权限。")) void action.run(async () => {await deleteTeam(id); navigate("/app");}).catch(() => {});}}>删除团队</button>
        : <button className="btn btn-danger" disabled={action.pending} onClick={() => {if(window.confirm("确定退出团队？未完成任务将待重新指派。")) void action.run(async () => {await leaveTeam(id); navigate("/app");}).catch(() => {});}}>退出团队</button>}
      </article>
    </div>
  </section>;
}
