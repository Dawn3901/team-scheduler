import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ackAnnouncement,
  announcementReceipts,
  createAnnouncement,
  deleteAnnouncement,
  formatTime,
  listAnnouncements,
  updateAnnouncement,
  type Announcement,
} from "@teamsync/shared";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useTeam } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";
import { useToast } from "../lib/toast";

/** CR-016 / ANNC-1·ANNC-2：团队通告列表、发布（Admin/Owner）、回执。 */
export default function AnnouncementsPage() {
  const teamId = Number(useParams().teamId);
  const team = useTeam(teamId).data;
  const zone = team?.timezone || "Asia/Shanghai";
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const action = useAction();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [receiptsFor, setReceiptsFor] = useState<Announcement | null>(null);
  const [error, setError] = useState("");
  useEscapeKey(Boolean(composing || receiptsFor), () => { setComposing(false); setReceiptsFor(null); });

  const query = useQuery({
    queryKey: ["announcements", teamId],
    queryFn: () => listAnnouncements(teamId),
  });
  const receipts = useQuery({
    queryKey: ["announcement-receipts", receiptsFor?.id],
    queryFn: () => announcementReceipts(receiptsFor!.id),
    enabled: Boolean(receiptsFor),
  });
  const canManage = team?.my_role === "owner" || team?.my_role === "admin";
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["announcements", teamId] });
    await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const ack = useMutation({
    mutationFn: (id: number) => ackAnnouncement(id),
    onSuccess: refresh,
    onError: err => setError(friendlyMessage(err)),
  });

  return (
    <section className="panel announcements-panel">
      <div className="page-head compact">
        <div>
          <p className="eyebrow">团队空间</p>
          <h2>团队通告</h2>
          <p className="muted">
            {query.data?.total ?? 0} 条 · {query.data?.unacked_count ?? 0} 条待我确认
          </p>
        </div>
        <div className="panel-actions">
          <Link className="btn btn-secondary" to="/app/inbox">收件箱</Link>
          {canManage && <button className="btn btn-primary" onClick={() => { setEditing(null); setComposing(true); }}>发布通告</button>}
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {query.isPending && <p>通告加载中…</p>}
      {query.isError && (
        <p role="alert">{friendlyMessage(query.error)}
          <button type="button" className="link-btn" onClick={() => void query.refetch()}>重试</button>
        </p>
      )}
      {query.data?.items.length === 0 && <p className="muted">还没有通告。例会上要大家知道的事，可以发在这里。</p>}

      <div className="announcement-list">
        {query.data?.items.map(item => (
          <article key={item.id} className={`announcement-card${item.pinned ? " pinned" : ""}${item.expired ? " expired" : ""}`} data-testid="announcement-card">
            <div className="announcement-head">
              {item.pinned ? <span className="notice-type">置顶</span> : null}
              <h3>{item.title}</h3>
              {item.expired ? <span className="muted">已过期</span> : null}
              {item.requires_ack && !item.acked ? <span className="chip chip-on">待确认</span> : null}
            </div>
            <p className="announcement-body">{item.body}</p>
            <div className="announcement-foot">
              <Avatar className="thread-avatar" name={item.author.display_name} url={item.author.avatar_url} />
              <span>{item.author.display_name}</span>
              <span>{formatTime(item.created_at, zone)}</span>
              {item.expires_at ? <span>有效至 {formatTime(item.expires_at, zone)}</span> : null}
              {item.requires_ack ? (
                <span className="ack-progress" aria-label={`已确认 ${item.ack_count}/${item.member_count}`}>
                  <span className="ack-bar"><span style={{ width: `${item.member_count ? Math.round((item.ack_count / item.member_count) * 100) : 0}%` }} /></span>
                  {item.ack_count}/{item.member_count}
                </span>
              ) : <span className="muted">无需确认</span>}
              {item.requires_ack && !item.acked && !item.expired && (
                <button className="btn btn-primary btn-sm" disabled={ack.isPending} onClick={() => ack.mutate(item.id)}>我知道了</button>
              )}
              {item.acked && <span className="muted">已确认</span>}
              {item.can_manage && (
                <span className="announcement-manage">
                  <button type="button" className="link-btn" onClick={() => setReceiptsFor(item)}>回执</button>
                  <button type="button" className="link-btn" onClick={() => { setEditing(item); setComposing(true); }}>编辑</button>
                  <button type="button" className="link-btn" disabled={action.pending} onClick={() => {
                    if (!window.confirm(`确定删除通告「${item.title}」？`)) return;
                    void action.run(() => deleteAnnouncement(item.id)).then(() => { notify("通告已删除", { tone: "success" }); return refresh(); }).catch(() => {});
                  }}>删除</button>
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      {composing && (
        <div className="modal-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-label={editing ? "编辑通告" : "发布通告"}>
          <h3>{editing ? "编辑通告" : "发布通告"}</h3>
          <form className="work-form" onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const payload = {
              title: String(form.get("title")),
              body: String(form.get("body")),
              pinned: form.get("pinned") === "on",
              requires_ack: form.get("requires_ack") === "on",
              expires_at: form.get("expires") ? new Date(String(form.get("expires"))).toISOString() : null,
            };
            void action.run(async () => {
              if (editing) await updateAnnouncement(editing.id, payload);
              else await createAnnouncement(teamId, payload);
              setComposing(false);
              setEditing(null);
              notify(editing ? "通告已更新" : "通告已发布", { tone: "success" });
            }).then(refresh).catch(() => {});
          }}>
            <label>标题<input name="title" maxLength={100} defaultValue={editing?.title} required autoFocus /></label>
            <label>正文<textarea name="body" maxLength={2000} defaultValue={editing?.body} required rows={5} /></label>
            <label className="inline-check"><input type="checkbox" name="pinned" defaultChecked={editing?.pinned} />置顶</label>
            <label className="inline-check"><input type="checkbox" name="requires_ack" defaultChecked={editing?.requires_ack ?? true} />需要成员点“我知道了”</label>
            <label>失效时间（可选）<input type="datetime-local" name="expires" defaultValue={editing?.expires_at ? editing.expires_at.slice(0, 16) : ""} /></label>
            <div className="panel-actions">
              <button className="btn btn-primary" disabled={action.pending}>{editing ? "保存" : "发布"}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setComposing(false); setEditing(null); }}>取消</button>
            </div>
          </form>
        </section></div>
      )}

      {receiptsFor && (
        <div className="modal-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-label="回执名单">
          <h3>回执：{receiptsFor.title}</h3>
          {receipts.isPending && <p>加载中…</p>}
          {receipts.isError && <p role="alert">{friendlyMessage(receipts.error)}</p>}
          {receipts.data && (
            <>
              <p className="muted">已确认 {receipts.data.acked_count}/{receipts.data.total}</p>
              <ul className="receipt-list">
                {receipts.data.items.map(person => (
                  <li key={person.user_id} className={person.acked ? "acked" : ""}>
                    <Avatar className="thread-avatar" name={person.display_name} url={person.avatar_url} />
                    <span>{person.display_name}</span>
                    <span className="muted">{person.acked ? `已确认 ${person.acked_at ? formatTime(person.acked_at, zone) : ""}` : "未确认"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="panel-actions"><button type="button" className="btn btn-secondary" onClick={() => setReceiptsFor(null)}>关闭</button></div>
        </section></div>
      )}
    </section>
  );
}
