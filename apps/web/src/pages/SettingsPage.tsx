import { deleteTeam, leaveTeam, rotateCode } from "@teamsync/shared";
import { useNavigate, useParams } from "react-router-dom";
import { useTeam } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";

export default function SettingsPage() {
  const id = Number(useParams().teamId);
  const team = useTeam(id).data;
  const action = useAction();
  const navigate = useNavigate();
  return <section className="panel"><h2>设置</h2>
    <p>团队：{team?.name}</p><p>描述：{team?.description || "暂无"}</p><p>时区：{team?.timezone}</p>
    <p className="muted">所有时间均按团队时区显示。</p>
    <div className="panel-actions">
      {team?.my_role !== "member" && <button className="btn btn-secondary" disabled={action.pending} onClick={() => { if(window.confirm("轮换后旧邀请码立即失效，确定继续？")) void action.run(() => rotateCode(id)).catch(() => {}); }}>轮换邀请码</button>}
      {team?.my_role === "owner" ? <button className="btn btn-danger" disabled={action.pending} onClick={() => {if(window.confirm("确定删除整个团队？成员将立即失去访问权限。")) void action.run(async () => {await deleteTeam(id); navigate("/app");}).catch(() => {});}}>删除团队</button>
      : <button className="btn btn-danger" disabled={action.pending} onClick={() => {if(window.confirm("确定退出团队？未完成任务将待重新指派。")) void action.run(async () => {await leaveTeam(id); navigate("/app");}).catch(() => {});}}>退出团队</button>}
    </div>
  </section>;
}
