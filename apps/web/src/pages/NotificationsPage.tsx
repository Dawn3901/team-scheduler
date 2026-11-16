import { useQuery } from "@tanstack/react-query";
import { listNotifications, readAllNotifications, readNotification, formatTime } from "@teamsync/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";
import { groupNotices, groupUnread, type NoticeGroup } from "../lib/noticeGroups";

function targetPath(group: NoticeGroup): string | null {
  const { payload } = group.latest;
  if (!payload.team_id) return null;
  if (payload.event_id) return `/app/teams/${payload.team_id}/events/${payload.event_id}`;
  return payload.task_id ? `/app/teams/${payload.team_id}/tasks?task=${payload.task_id}` : null;
}

export default function NotificationsPage() {
  const [offset, setOffset] = useState(0);
  const [unread, setUnread] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = useQuery({queryKey: ["notifications", offset, unread], queryFn: () => listNotifications(offset, unread)});
  const action = useAction(); const navigate = useNavigate();
  const groups = groupNotices(query.data?.items ?? []);

  const openGroup = (group: NoticeGroup) => {
    const path = targetPath(group);
    void action.run(async () => {
      for (const item of group.items) if (!item.read_at) await readNotification(item.id);
      if (path) navigate(path);
    }).catch(() => {});
  };
  const markGroupRead = (group: NoticeGroup) => void action.run(async () => {
    for (const item of group.items) if (!item.read_at) await readNotification(item.id);
  }).catch(() => {});

  return <section className="panel"><h1>通知中心</h1>
    <div className="panel-actions"><button className="btn btn-secondary" aria-pressed={unread} onClick={() => {setUnread(!unread); setOffset(0); setExpanded(null);}}>{unread ? "显示全部" : "仅显示未读"}</button><button className="btn btn-secondary" disabled={action.pending} onClick={() => void action.run(readAllNotifications).catch(() => {})}>全部已读</button></div>
    {query.isError && <p role="alert">{friendlyMessage(query.error)}</p>}
    {query.isPending && <p>通知加载中…</p>}
    {query.data?.items.length === 0 && <p className="muted">暂无通知</p>}
    {groups.map(group => {
      const unreadCount = groupUnread(group);
      const isOpen = expanded === group.key;
      return <div className={`work-row notice notice-group${unreadCount ? " unread" : ""}`} key={group.key} data-testid="notice-group">
        <button type="button" className="notice-main" onClick={() => openGroup(group)}>
          <span className="notice-title"><span className="notice-type">{group.typeLabel}</span><strong>{group.title}</strong>
            {group.items.length > 1 ? <span className="notice-count">×{group.items.length}</span> : null}
            {group.target ? <small className="muted">（原：{group.target}）</small> : null}
          </span>
          {group.latest.body ? <p>{group.latest.body}</p> : null}
        </button>
        <span className="notice-meta">
          <span>{unreadCount ? "未读" : "已读"} · {formatTime(group.latest.created_at, "Asia/Shanghai")}</span>
          <span className="notice-actions">
            {group.items.length > 1 && <button type="button" className="link-btn" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : group.key)}>{isOpen ? "收起" : `另 ${group.items.length - 1} 条`}</button>}
            {unreadCount ? <button type="button" className="link-btn" disabled={action.pending} onClick={() => markGroupRead(group)}>标为已读</button> : null}
          </span>
        </span>
        {isOpen ? <ul className="notice-history" aria-label="同类通知历史">
          {group.items.map(item => <li key={item.id} className={item.read_at ? "" : "unread"}>
            <span>{formatTime(item.created_at, "Asia/Shanghai")}</span>
            <span>{item.title}</span>
            <span className="muted">{item.read_at ? "已读" : "未读"}</span>
          </li>)}
        </ul> : null}
      </div>;
    })}
    <div className="panel-actions"><button disabled={offset === 0} onClick={() => setOffset(offset - 20)}>上一页</button><span>{offset + 1} / {query.data?.total ?? 0}</span><button disabled={!query.data || offset + 20 >= query.data.total} onClick={() => setOffset(offset + 20)}>下一页</button></div>
  </section>;
}
