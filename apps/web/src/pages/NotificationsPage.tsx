import { useQuery } from "@tanstack/react-query";
import { listNotifications, readAllNotifications, readNotification, formatTime } from "@teamsync/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";

export default function NotificationsPage() {
  const [offset, setOffset] = useState(0);
  const [unread, setUnread] = useState(false);
  const query = useQuery({queryKey: ["notifications", offset, unread], queryFn: () => listNotifications(offset, unread)});
  const action = useAction(); const navigate = useNavigate();
  return <section className="panel"><h1>通知中心</h1>
    <div className="panel-actions"><button className="btn btn-secondary" aria-pressed={unread} onClick={() => {setUnread(!unread); setOffset(0);}}>{unread ? "显示全部" : "仅显示未读"}</button><button className="btn btn-secondary" disabled={action.pending} onClick={() => void action.run(readAllNotifications).catch(() => {})}>全部已读</button></div>
    {query.isError && <p role="alert">{friendlyMessage(query.error)}</p>}
    {query.isPending && <p>通知加载中…</p>}
    {query.data?.items.length === 0 && <p className="muted">暂无通知</p>}
    {query.data?.items.map(n => <button className={`work-row notice ${n.read_at ? "" : "unread"}`} key={n.id} onClick={() => void action.run(async () => {
      await readNotification(n.id);
      if(n.payload.team_id) navigate(`/app/teams/${n.payload.team_id}/${n.payload.event_id ? `events/${n.payload.event_id}` : `tasks${n.payload.task_id ? `?task=${n.payload.task_id}` : ""}`}`);
    }).catch(() => {})}><span><strong>{n.title}</strong><p>{n.body}</p></span><span>{n.read_at ? "已读" : "未读"} · {formatTime(n.created_at, "Asia/Shanghai")}</span></button>)}
    <div className="panel-actions"><button disabled={offset === 0} onClick={() => setOffset(offset - 20)}>上一页</button><span>{offset + 1} / {query.data?.total ?? 0}</span><button disabled={!query.data || offset + 20 >= query.data.total} onClick={() => setOffset(offset + 20)}>下一页</button></div>
  </section>;
}
