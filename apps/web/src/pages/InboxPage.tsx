import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchInbox, formatTime, markRead, type InboxItem } from "@teamsync/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { friendlyMessage } from "../lib/errors";

const KIND_LABEL: Record<InboxItem["kind"], string> = {
  announcement: "通告",
  mention: "@我",
  message: "新消息",
};

function targetPath(item: InboxItem): string {
  if (item.target_type === "task") return `/app/teams/${item.team_id}/tasks?task=${item.target_id}`;
  if (item.target_type === "event") return `/app/teams/${item.team_id}/events/${item.target_id}`;
  return `/app/teams/${item.team_id}/announcements`;
}

/** CR-016 / MSG-3：收件箱（未回执通告 + @我 + 我负责对象的新消息）。 */
export default function InboxPage() {
  const query = useQuery({ queryKey: ["inbox"], queryFn: fetchInbox });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = async (item: InboxItem) => {
    setBusy(true);
    setError("");
    try {
      await markRead(item.target_type, item.target_id);
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      navigate(targetPath(item));
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel inbox-panel">
      <div className="page-head compact">
        <div>
          <p className="eyebrow">我的</p>
          <h1>收件箱</h1>
          <p className="muted">
            {query.data?.counts.announcements ?? 0} 条待确认通告 · {query.data?.counts.mentions ?? 0} 条 @我 · {query.data?.counts.messages ?? 0} 个对象有新消息
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void query.refetch()}>刷新</button>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {query.isPending && <p>收件箱加载中…</p>}
      {query.isError && (
        <p role="alert">{friendlyMessage(query.error)}
          <button type="button" className="link-btn" onClick={() => void query.refetch()}>重试</button>
        </p>
      )}
      {query.data?.items.length === 0 && (
        <p className="muted">收件箱是空的。被 @、活动/任务有新讨论，或管理员发布需要确认的通告时，会出现在这里。</p>
      )}

      <div className="inbox-list">
        {query.data?.items.map(item => {
          // 消息以“说了什么”为主：正文大字，对象名退到副标题。
          const primary = item.kind === "announcement" ? item.title : item.preview;
          const secondary = item.kind === "announcement" ? item.preview : `在「${item.title}」中`;
          return (
            <button
              type="button"
              key={`${item.kind}-${item.target_type}-${item.target_id}-${item.created_at}`}
              className="inbox-item"
              disabled={busy}
              onClick={() => void open(item)}
            >
              <span className="inbox-item-head">
                <span className="inbox-kind">{KIND_LABEL[item.kind]}</span>
                <span className="inbox-context">{secondary}</span>
                {item.unread && item.unread > 1 ? <span className="notice-count">×{item.unread}</span> : null}
              </span>
              <p className="inbox-content">{primary || "（无正文）"}</p>
              <span className="muted">{formatTime(item.created_at, "Asia/Shanghai")}</span>
            </button>
          );
        })}
      </div>

      {query.data && query.data.items.length > 0 && (
        <p className="muted">打开任意一条即标记为已读；通告需要点“我知道了”才会从收件箱移除。</p>
      )}
      <div className="panel-actions">
        <Link className="btn btn-secondary" to="/app">返回我的团队</Link>
      </div>
    </section>
  );
}
