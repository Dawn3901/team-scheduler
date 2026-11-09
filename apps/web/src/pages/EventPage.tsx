import { useNow } from "../hooks/useNow";
import { useQuery } from "@tanstack/react-query";
import { deleteEvent, formatTime, getEvent, listMembers, removeParticipant, respond, updateEvent, type EventScope } from "@teamsync/shared";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import EventEditor from "../components/EventEditor";
import { useMe, useTeam } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";

export default function EventPage() {
  const now = useNow();
  const params = useParams(); const id = Number(params.eventId); const teamId = Number(params.teamId);
  const query = useQuery({queryKey:["event",id], queryFn:() => getEvent(id)});
  const members = useQuery({queryKey:["members",teamId], queryFn:() => listMembers(teamId)});
  const team = useTeam(teamId).data; const me = useMe().data; const action = useAction();
  const navigate = useNavigate(); const [editing,setEditing] = useState(false);
  const [scope,setScope] = useState<EventScope>("this");
  if(query.isPending) return <p>活动加载中…</p>;
  if(query.isError || query.data.team_id !== teamId) return <section className="panel"><h2>活动不可用</h2><p role="alert">{query.isError ? friendlyMessage(query.error) : "活动不属于当前团队"}</p><Link to={`../calendar`}>返回日历</Link></section>;
  const event = query.data; const zone = team?.timezone || "Asia/Shanghai";
  const edit = event.created_by === me?.id || team?.my_role !== "member";
  const open = event.status === "confirmed" && Date.parse(event.end_at) > now;
  return <section className="panel event-detail">
    <div className="event-detail-head">
      <div><Link to={`/app/teams/${teamId}/calendar`}>← 返回日历</Link><h2>{event.title}</h2></div>
      {edit && event.status === "confirmed" && <button className="btn btn-secondary" onClick={() => setEditing(true)}>编辑活动</button>}
    </div>
    <p>{formatTime(event.start_at,zone)} — {formatTime(event.end_at,zone)} {event.all_day && "· 全天"}</p>
    <p>{event.location || "未设置地点"} · {event.visibility === "private" ? "私密" : "团队可见"} · {event.status === "cancelled" ? "已取消" : "已安排"}</p><p>{event.description}</p>
    {event.series_id && <p className="muted">重复系列 #{event.series_id} · 每次活动独立回应</p>}
    {event.my_needs_confirmation && <p role="status" className="confirmation-banner">活动时间或地点已变更，请重新确认是否参加。</p>}
    <h3>参与者</h3>{event.participants.map(p => <div className="work-row" key={p.user_id}><span>{p.display_name} {p.is_organizer && "（组织者）"} · {({pending:p.needs_confirmation ? "待重新确认" : "待回应",accepted:"接受",declined:"拒绝",tentative:"待定"})[p.response]}</span>{edit && !p.is_organizer && <button className="btn btn-ghost" onClick={() => {if(window.confirm(`确定移除 ${p.display_name} 的邀请？`)) void action.run(() => removeParticipant(id,p.user_id)).catch(() => {});}}>移除邀请</button>}</div>)}
    {open && event.my_response && event.created_by !== me?.id && <div className="panel-actions">{(["accepted","tentative","declined"] as const).map(r => <button className={`btn ${event.my_response === r ? "btn-primary" : "btn-secondary"}`} aria-pressed={event.my_response === r} disabled={action.pending} key={r} onClick={() => void action.run(() => respond(id,r)).catch(() => {})}>{({accepted:"接受",tentative:"待定",declined:"拒绝"})[r]}</button>)}</div>}
    {edit && event.series_id && <label>取消/删除范围<select aria-label="取消删除范围" value={scope} onChange={e => setScope(e.target.value as EventScope)}><option value="this">仅本次</option><option value="future">本次及以后（未开始）</option><option value="all">整个系列（未开始）</option></select></label>}
    {edit && <div className="panel-actions">{event.status === "confirmed" && <button className="btn btn-ghost" disabled={action.pending} onClick={() => {if(window.confirm("确定按所选范围取消活动并通知参与者？")) void action.run(() => updateEvent(id,{status:"cancelled",scope})).catch(() => {});}}>取消活动</button>}<button className="btn btn-danger" disabled={action.pending} onClick={() => {if(window.confirm("确定按所选范围删除活动？")) void action.run(async () => {await deleteEvent(id,scope); navigate(`/app/teams/${teamId}/calendar`);}).catch(() => {});}}>删除活动</button></div>}
    {editing && <EventEditor teamId={teamId} timezone={zone} members={members.data?.items || []} current={event} onClose={() => setEditing(false)} />}
  </section>;
}
