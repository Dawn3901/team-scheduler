import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEventMessage,
  createTaskMessage,
  formatTime,
  listEventMessages,
  listTaskMessages,
  markRead,
  type MessageInput,
  type MessageKind,
  type MessageTarget,
} from "@teamsync/shared";
import { useState } from "react";

import { Avatar } from "./Avatar";
import { friendlyMessage } from "../lib/errors";

const KIND_LABEL: Record<MessageKind, string> = {
  comment: "讨论",
  note: "说明",
  requirement: "要求",
  blocker: "受阻",
  unblock: "已解除",
  handoff: "交接",
  change_reason: "变更原因",
};

interface ThreadProps {
  target: Extract<MessageTarget, "event" | "task">;
  targetId: number;
  teamId: number;
  /** 可写：活动需可见，任务团队成员均可。 */
  canWrite?: boolean;
  members: Array<{ user_id: number; display_name: string }>;
  currentUserId?: number;
  /** 只展示某些 kind（例如活动只显示改动记录）。 */
  onlyKinds?: MessageKind[];
  title?: string;
  compact?: boolean;
}

/**
 * CR-016 / MSG-1：对象内讨论。
 * 只做平铺 + @；不做树形回复、富文本、附件（见 CR-016 §2.2）。
 */
export function MessageThread({
  target,
  targetId,
  teamId,
  canWrite = true,
  members,
  currentUserId,
  onlyKinds,
  title = "讨论",
  compact = false,
}: ThreadProps) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<MessageKind>("comment");
  const [mentions, setMentions] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const query = useQuery({
    queryKey: ["messages", target, targetId],
    queryFn: () => (target === "event" ? listEventMessages(targetId) : listTaskMessages(targetId)),
  });

  const send = useMutation({
    mutationFn: (input: MessageInput) =>
      target === "event"
        ? createEventMessage(targetId, input)
        : createTaskMessage(targetId, input),
    onSuccess: async () => {
      setBody("");
      setMentions([]);
      setKind("comment");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["messages", target, targetId] });
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      await queryClient.invalidateQueries({ queryKey: ["tasks", teamId] });
    },
    onError: (err) => setError(friendlyMessage(err)),
  });

  // 打开讨论即推进读位；失败不提示（读位是体验优化，不能阻断阅读）。
  const markReadNow = () => {
    void markRead(target, targetId).then(() =>
      queryClient.invalidateQueries({ queryKey: ["inbox"] }),
    ).catch(() => undefined);
  };

  const items = query.data?.items ?? [];
  const visible = onlyKinds ? items.filter(item => onlyKinds.includes(item.kind)) : items;
  const shown = !showAll && visible.length > 6 ? visible.slice(-6) : visible;

  return (
    <section className={`thread${compact ? " thread-compact" : ""}`} aria-label={title}>
      <header className="thread-head">
        <h3>{title}</h3>
        <span className="muted">{visible.length} 条</span>
        {visible.length > 6 && (
          <button type="button" className="link-btn" onClick={() => setShowAll(v => !v)}>
            {showAll ? "只看最新" : `查看全部 ${visible.length} 条`}
          </button>
        )}
        <button type="button" className="link-btn" onClick={markReadNow}>标为已读</button>
      </header>

      {query.isPending && <p className="muted">加载中…</p>}
      {query.isError && (
        <p role="alert">{friendlyMessage(query.error)}
          <button type="button" className="link-btn" onClick={() => void query.refetch()}>重试</button>
        </p>
      )}
      {!query.isPending && visible.length === 0 && (
        <p className="muted thread-empty">还没有讨论。例如：地点定了吗？需要带什么？</p>
      )}

      <ol className="thread-list">
        {shown.map(item => (
          <li key={item.id} className={`thread-item thread-${item.kind}`}>
            <Avatar
              className="thread-avatar"
              name={item.author.display_name}
              url={item.author.avatar_url}
            />
            <div className="thread-body">
              <div className="thread-meta">
                <strong>{item.author.display_name}</strong>
                {item.kind !== "comment" && (
                  <span className={`thread-kind kind-${item.kind}`}>{KIND_LABEL[item.kind]}</span>
                )}
                <span className="muted">{formatTime(item.created_at, "Asia/Shanghai")}</span>
              </div>
              <p className="thread-text">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {canWrite ? (
        <form
          className="thread-form"
          aria-label={`${title}输入`}
          onSubmit={event => {
            event.preventDefault();
            if (!body.trim()) return;
            send.mutate({ body: body.trim(), kind, mention_user_ids: mentions });
          }}
        >
          <label className="thread-kind-select">
            <span className="sr-only">消息类型</span>
            <select value={kind} onChange={e => setKind(e.target.value as MessageKind)} aria-label="消息类型">
              <option value="comment">讨论</option>
              {target === "task" ? (
                <>
                  <option value="requirement">要求</option>
                  <option value="blocker">受阻原因</option>
                  <option value="unblock">解除受阻</option>
                  <option value="handoff">交接</option>
                </>
              ) : (
                <option value="note">说明</option>
              )}
            </select>
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="写一句；可用下面的按钮 @ 成员"
            maxLength={2000}
            rows={2}
            aria-label={`${title}内容`}
          />
          {members.length > 0 && (
            <div className="thread-mentions" aria-label="提及成员">
              {members
                .filter(member => member.user_id !== currentUserId)
                .slice(0, 8)
                .map(member => (
                  <button
                    type="button"
                    key={member.user_id}
                    className={mentions.includes(member.user_id) ? "chip chip-on" : "chip"}
                    aria-pressed={mentions.includes(member.user_id)}
                    onClick={() =>
                      setMentions(prev =>
                        prev.includes(member.user_id)
                          ? prev.filter(id => id !== member.user_id)
                          : [...prev, member.user_id],
                      )
                    }
                  >
                    @{member.display_name}
                  </button>
                ))}
            </div>
          )}
          {error && <p className="thread-error" role="alert">{error}</p>}
          <div className="thread-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={send.isPending || !body.trim()}>
              {send.isPending ? "发送中…" : "发送"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
