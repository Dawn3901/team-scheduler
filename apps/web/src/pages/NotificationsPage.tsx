import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchInbox,
  formatTime,
  listNotifications,
  markRead,
  readAllNotifications,
  readNotification,
  type Inbox,
  type InboxItem,
} from "@teamsync/shared";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";
import { groupNotices, groupUnread, type NoticeGroup } from "../lib/noticeGroups";

const KIND_LABEL: Record<InboxItem["kind"], string> = {
  announcement: "通告",
  mention: "@我",
  message: "新消息",
};

function targetPath(group: NoticeGroup): string | null {
  const { payload } = group.latest;
  if (!payload.team_id) return null;
  if (payload.event_id) return `/app/teams/${payload.team_id}/events/${payload.event_id}`;
  if (payload.task_id) return `/app/teams/${payload.team_id}/tasks?task=${payload.task_id}`;
  if (payload.announcement_id) return `/app/teams/${payload.team_id}/announcements`;
  return null;
}

function inboxPath(item: InboxItem): string {
  if (item.target_type === "task") return `/app/teams/${item.team_id}/tasks?task=${item.target_id}`;
  if (item.target_type === "event") return `/app/teams/${item.team_id}/events/${item.target_id}`;
  return `/app/teams/${item.team_id}/announcements`;
}

/**
 * 通知页：合并原“收件箱”与“通知中心”（CR-016 反馈）。
 * 待处理 = 需要我做的事（未确认通告 / @我 / 我负责对象的新消息），打开即消失。
 * 全部动态 = 事件流（邀请、改期、指派、提醒、@、新通告），按对象合并。
 */
export default function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  // 默认落在“全部动态”：邀请/改期这类要靠通知点进去处理，与合并前通知中心一致。
  const tab = params.get("tab") === "pending" ? "pending" : "all";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const inbox = useQuery({ queryKey: ["inbox"], queryFn: fetchInbox, refetchInterval: 60000 });
  const inboxTotal = inbox.data?.total ?? 0;
  const counts = inbox.data?.counts ?? { announcements: 0, mentions: 0, messages: 0 };

  const open = async (item: InboxItem) => {
    setOpening(true);
    setError("");
    try {
      await markRead(item.target_type, item.target_id);
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      navigate(inboxPath(item));
    } catch (err) {
      setError(friendlyMessage(err));
    } finally {
      setOpening(false);
    }
  };

  const switchTab = (next: "pending" | "all") => {
    setParams(next === "pending" ? { tab: "pending" } : {}, { replace: true });
    setExpanded(null);
  };

  const notices = useQuery({
    queryKey: ["notifications", offset, unreadOnly],
    queryFn: () => listNotifications(offset, unreadOnly),
    enabled: tab === "all",
  });
  const action = useAction();
  const groups = groupNotices(notices.data?.items ?? []);

  const openGroup = (group: NoticeGroup) => {
    const path = targetPath(group);
    void action.run(async () => {
      for (const item of group.items) if (!item.read_at) await readNotification(item.id);
      if (path) navigate(path);
    }).catch(() => {});
  };
  const markGroupRead = (group: NoticeGroup) =>
    void action.run(async () => {
      for (const item of group.items) if (!item.read_at) await readNotification(item.id);
    }).catch(() => {});

  return (
    <section className="panel notifications-panel">
      <div className="page-head compact">
        <div>
          <p className="eyebrow">我的</p>
          <h1>通知</h1>
          <p className="muted">
            待处理 {inboxTotal} 条 · {counts.announcements} 条待确认通告 · {counts.mentions} 条 @我 ·{" "}
            {counts.messages} 个对象有新消息
          </p>
        </div>
      </div>

      <div className="notice-toolbar">
      <div className="notice-tabs" role="tablist" aria-label="通知分类">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          className={tab === "pending" ? "notice-tab active" : "notice-tab"}
          onClick={() => switchTab("pending")}
        >
          待处理{inboxTotal ? `（${inboxTotal}）` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={tab === "all" ? "notice-tab active" : "notice-tab"}
          onClick={() => switchTab("all")}
        >
          全部动态
        </button>
      </div>
      {tab === "all" && (
        <div className="panel-actions notice-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={unreadOnly}
            onClick={() => {
              setUnreadOnly(!unreadOnly);
              setOffset(0);
              setExpanded(null);
            }}
          >
            {unreadOnly ? "显示全部" : "仅显示未读"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={action.pending}
            onClick={() => void action.run(readAllNotifications).catch(() => {})}
          >
            全部已读
          </button>
        </div>
      )}
      </div>

      {tab === "pending" ? (
        <PendingTab inbox={inbox.data} pending={inbox.isPending} error={inbox.isError ? inbox.error : null}
          busy={opening} message={error} onRetry={() => void inbox.refetch()} onOpen={item => void open(item)} />
      ) : (
        <AllTab
          groups={groups}
          pending={notices.isPending}
          error={notices.isError ? notices.error : null}
          total={notices.data?.items.length ?? 0}
          pageTotal={notices.data?.total ?? 0}
          offset={offset}
          unreadOnly={unreadOnly}
          expanded={expanded}
          actionPending={action.pending}
          onRetry={() => void notices.refetch()}
          onOpen={openGroup}
          onMarkRead={markGroupRead}
          onExpand={key => setExpanded(expanded === key ? null : key)}
          onOffset={setOffset}
          onGoPending={() => switchTab("pending")}
        />
      )}
    </section>
  );
}

function PendingTab({
  inbox,
  pending,
  error,
  busy,
  message,
  onRetry,
  onOpen,
}: {
  inbox: Inbox | undefined;
  pending: boolean;
  error: unknown;
  busy: boolean;
  message: string;
  onRetry: () => void;
  onOpen: (item: InboxItem) => void;
}) {
  if (pending) return <p>通知加载中…</p>;
  if (error) {
    return (
      <p role="alert">
        {friendlyMessage(error)}
        <button type="button" className="link-btn" onClick={onRetry}>重试</button>
      </p>
    );
  }
  const items = inbox?.items ?? [];
  return (
    <>
      {message && <p role="alert">{message}</p>}
      {items.length === 0 && (
        <p className="muted">
          没有待处理的事。被 @、我负责的活动/任务有新讨论，或管理员发布需要确认的通告时，会出现在这里。
        </p>
      )}
      <div className="inbox-list">
        {items.map(item => {
          // 消息以“说了什么”为主：正文大字，对象名退到副标题。
          const primary = item.kind === "announcement" ? item.title : item.preview;
          const secondary = item.kind === "announcement" ? item.preview : `在「${item.title}」中`;
          return (
            <button
              type="button"
              key={`${item.kind}-${item.target_type}-${item.target_id}-${item.created_at}`}
              className="inbox-item"
              disabled={busy}
              onClick={() => onOpen(item)}
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
      {items.length > 0 && (
        <p className="muted">打开任意一条即标记为已读；通告需要点“我知道了”才会从这里移除。</p>
      )}
    </>
  );
}

function AllTab({
  groups,
  pending,
  error,
  total,
  pageTotal,
  offset,
  unreadOnly,
  expanded,
  actionPending,
  onRetry,
  onOpen,
  onMarkRead,
  onExpand,
  onOffset,
  onGoPending,
}: {
  groups: NoticeGroup[];
  pending: boolean;
  error: unknown;
  total: number;
  pageTotal: number;
  offset: number;
  unreadOnly: boolean;
  expanded: string | null;
  actionPending: boolean;
  onRetry: () => void;
  onOpen: (group: NoticeGroup) => void;
  onMarkRead: (group: NoticeGroup) => void;
  onExpand: (key: string) => void;
  onOffset: (offset: number) => void;
  onGoPending: () => void;
}) {
  if (error) {
    return (
      <p role="alert">
        {friendlyMessage(error)}
        <button type="button" className="link-btn" onClick={onRetry}>重试</button>
      </p>
    );
  }
  if (pending) return <p>通知加载中…</p>;
  if (!pending && total === 0) {
    return (
      <p className="muted">
        {unreadOnly ? "没有未读动态。" : "还没有动态。被邀请、被指派、活动改期或有人 @ 你时，会记录在这里。"}
        {!unreadOnly && (
          <button type="button" className="link-btn" onClick={onGoPending}>看待处理</button>
        )}
      </p>
    );
  }
  return (
    <>
      {groups.map(group => {
        const unreadCount = groupUnread(group);
        const isOpen = expanded === group.key;
        return (
          <div
            className={`work-row notice notice-group${unreadCount ? " unread" : ""}`}
            key={group.key}
            data-testid="notice-group"
          >
            <button type="button" className="notice-main" onClick={() => onOpen(group)}>
              <span className="notice-title">
                <span className="notice-type">{group.typeLabel}</span>
                <strong>{group.title}</strong>
                {group.items.length > 1 ? <span className="notice-count">×{group.items.length}</span> : null}
                {group.target ? <small className="muted">（原：{group.target}）</small> : null}
              </span>
              {group.latest.body ? <p>{group.latest.body}</p> : null}
            </button>
            <span className="notice-meta">
              <span>
                {unreadCount ? "未读" : "已读"} · {formatTime(group.latest.created_at, "Asia/Shanghai")}
              </span>
              <span className="notice-actions">
                {group.items.length > 1 && (
                  <button
                    type="button"
                    className="link-btn"
                    aria-expanded={isOpen}
                    onClick={() => onExpand(group.key)}
                  >
                    {isOpen ? "收起" : `另 ${group.items.length - 1} 条`}
                  </button>
                )}
                {unreadCount ? (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={actionPending}
                    onClick={() => onMarkRead(group)}
                  >
                    标为已读
                  </button>
                ) : null}
              </span>
            </span>
            {isOpen ? (
              <ul className="notice-history" aria-label="同类通知历史">
                {group.items.map(item => (
                  <li key={item.id} className={item.read_at ? "" : "unread"}>
                    <span>{formatTime(item.created_at, "Asia/Shanghai")}</span>
                    <span>{item.title}</span>
                    <span className="muted">{item.read_at ? "已读" : "未读"}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      <div className="panel-actions notice-pager">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={offset === 0}
          onClick={() => onOffset(offset - 20)}
        >
          上一页
        </button>
        <span className="muted">{Math.floor(offset / 20) + 1} / {Math.max(1, Math.ceil(pageTotal / 20))}</span>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={offset + 20 >= pageTotal}
          onClick={() => onOffset(offset + 20)}
        >
          下一页
        </button>
        <Link className="btn btn-secondary" to="/app">返回我的团队</Link>
      </div>
    </>
  );
}
