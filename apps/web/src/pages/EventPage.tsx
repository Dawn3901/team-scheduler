import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteEvent, formatTime, getEvent, listMembers, removeParticipant, respond, type EventScope, type Participant, type Rsvp } from "@teamsync/shared";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackToCalendar } from "../components/BackToCalendar";
import EventEditor from "../components/EventEditor";
import { MessageThread } from "../components/MessageThread";
import { useMe, useTeam } from "../hooks/useSession";
import { useNow } from "../hooks/useNow";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";

const RESPONSE_LABEL: Record<Rsvp, string> = {
  pending: "待回应",
  accepted: "接受",
  tentative: "待定",
  declined: "拒绝",
};

function ResponseChip({ response, needsConfirmation }: { response: Rsvp; needsConfirmation?: boolean }) {
  if (response === "pending") {
    return <span className="rsvp-chip pending">{needsConfirmation ? "待重新确认" : "待回应"}</span>;
  }
  return <span className={`rsvp-chip ${response}`}>{RESPONSE_LABEL[response]}</span>;
}

export default function EventPage() {
  const now = useNow();
  const params = useParams(); const id = Number(params.eventId); const teamId = Number(params.teamId);
  const query = useQuery({queryKey:["event",id], queryFn: () => getEvent(id)});
  const members = useQuery({queryKey:["members",teamId], queryFn: () => listMembers(teamId)});
  const team = useTeam(teamId).data; const me = useMe().data; const action = useAction();
  const navigate = useNavigate(); const [editing,setEditing] = useState(false);
  const [scope,setScope] = useState<EventScope>("this");
  const [rsvpNote, setRsvpNote] = useState("");
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({queryKey: ["event", id]});
    await queryClient.invalidateQueries({queryKey: ["events"]});
  };
  if(query.isPending) return <p>活动加载中…</p>;
  if(query.isError || query.data.team_id !== teamId) return <section className="panel"><h2>活动不可用</h2><p role="alert">{query.isError ? friendlyMessage(query.error) : "活动不属于当前团队"}</p><BackToCalendar teamId={teamId} /></section>;
  const event = query.data; const zone = team?.timezone || "Asia/Shanghai";
  const edit = event.created_by === me?.id || team?.my_role !== "member";
  const open = event.status === "confirmed" && Date.parse(event.end_at) > now;
  const mine = event.participants.find(p => p.user_id === me?.id);
  // 只有普通参与者能自己回应；组织者由后端拒绝（ORGANIZER_CANNOT_DECLINE），这里也不给按钮。
  const canRespond = open && Boolean(mine) && !mine?.is_organizer && event.created_by !== me?.id;

  const cancelEvent = () => {
    const hint = event.series_id
      ? `确定取消${({this:"仅本次",future:"本次及以后",all:"整个系列"})[scope]}的活动，并通知参与者？`
      : "确定取消这个活动，并通知参与者？";
    if (!window.confirm(hint)) return;
    // 合并“取消/删除”后，取消＝软删除 + 通知 + 支持重复系列范围。
    void action.run(async () => {
      await deleteEvent(id, scope);
      navigate(`/app/teams/${teamId}/calendar`);
    }).catch(() => {});
  };

  const renderRow = (p: Participant) => {
    const isMe = p.user_id === me?.id;
    return (
      <div className={`work-row participant-row${isMe ? " is-me" : ""}`} key={p.user_id}>
        <div className="participant-main">
          <span className="participant-name">{p.display_name}</span>
          {p.note ? <p className="participant-note">附言：{p.note}</p> : null}
        </div>
        <div className="participant-side">
          {canRespond && isMe ? (
            <div className="rsvp-actions" role="group" aria-label="我的回应">
              {(["accepted", "tentative", "declined"] as const).map(r => {
                const active = p.response === r;
                return (
                  <button
                    type="button"
                    key={r}
                    className={`btn btn-sm ${active ? "btn-primary" : "btn-secondary"}`}
                    aria-pressed={active}
                    disabled={action.pending}
                    onClick={() => void action.run(async () => {
                      await respond(id, r, rsvpNote.trim() || undefined);
                      setRsvpNote("");
                    }).then(refresh).catch(() => {})}
                  >
                    {RSP_LABEL[r]}
                  </button>
                );
              })}
            </div>
          ) : p.is_organizer ? (
            // 组织者一定参加，显示“接受”没有信息量，直接标身份（“我”由整行高亮体现）。
            <span className="rsvp-chip organizer">组织者</span>
          ) : (
            <ResponseChip response={p.response} needsConfirmation={p.needs_confirmation} />
          )}
          {edit && !p.is_organizer ? (
            <button
              type="button"
              className="icon-btn rsvp-remove"
              aria-label={`移除 ${p.display_name} 的邀请`}
              title="移除邀请"
              disabled={action.pending}
              onClick={() => {
                if (window.confirm(`确定移除 ${p.display_name} 的邀请？`)) {
                  void action.run(() => removeParticipant(id, p.user_id)).then(refresh).catch(() => {});
                }
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return <section className="panel event-detail">
    <div className="event-detail-head">
      <div><BackToCalendar teamId={teamId} /><h2>{event.title}</h2></div>
      {edit && (
        <div className="event-head-actions">
          {event.series_id ? (
            <label className="event-scope">
              <span className="sr-only">重复系列范围</span>
              <select aria-label="取消范围" value={scope} onChange={e => setScope(e.target.value as EventScope)}>
                <option value="this">仅本次</option>
                <option value="future">本次及以后</option>
                <option value="all">整个系列</option>
              </select>
            </label>
          ) : null}
          {event.status === "confirmed" && <button className="btn btn-secondary" onClick={() => setEditing(true)}>编辑活动</button>}
          {event.status === "confirmed" && <button className="btn btn-secondary" disabled={action.pending} onClick={cancelEvent}>取消活动</button>}
        </div>
      )}
    </div>
    <p>{formatTime(event.start_at,zone)} — {formatTime(event.end_at,zone)} {event.all_day && "· 全天"}</p>
    <p>{event.location || "未设置地点"} · {event.visibility === "private" ? "私密" : "团队可见"} · {event.status === "cancelled" ? "已取消" : "已安排"}</p><p>{event.description}</p>
    {event.series_id && <p className="muted">重复系列 #{event.series_id} · 每次活动独立回应</p>}
    {event.my_needs_confirmation && <p role="status" className="confirmation-banner">活动时间或地点已变更，请重新确认是否参加。</p>}
    <h3>参与者</h3>
    <div className="participant-list">{event.participants.map(renderRow)}</div>
    {canRespond && (
      <label className="rsvp-note-field">
        <span>附一句（可选，仅组织者与你自己可见）</span>
        <input
          value={rsvpNote}
          maxLength={500}
          onChange={e => setRsvpNote(e.target.value)}
          placeholder="例如：我会迟到 10 分钟"
          aria-label="回应附言"
        />
      </label>
    )}
    <div className="event-messages">
      <MessageThread
        target="event"
        targetId={id}
        teamId={teamId}
        members={members.data?.items || []}
        currentUserId={me?.id}
        canWrite={event.status === "confirmed"}
        title="活动讨论"
      />
    </div>
    {editing && <EventEditor teamId={teamId} timezone={zone} members={members.data?.items || []} current={event} currentUserId={me?.id} onClose={() => setEditing(false)} />}
  </section>;
}

const RSP_LABEL = { accepted: "接受", tentative: "待定", declined: "拒绝" } as const;
