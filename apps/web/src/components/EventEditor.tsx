import { useNow } from "../hooks/useNow";
import { ApiError, createEvent, getEvent, inviteParticipants, localInput, shiftDate, toUtc, updateEvent, type CalendarEvent, type EventInput, type EventScope, type Member } from "@teamsync/shared";
import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useAction } from "../hooks/useWork";

export default function EventEditor({teamId, timezone, members, current, initial, initialEnd, initialParticipants = [], currentUserId, onClose}: {
  teamId: number; timezone: string; members: Member[]; current?: CalendarEvent;
  initial?: string; initialEnd?: string; initialParticipants?: number[]; currentUserId?: number; onClose: () => void;
}) {
  const now = useNow();
  const action = useAction();
  useEscapeKey(!action.pending, onClose);
  const invitableMembers = members.filter(m => m.user_id !== currentUserId);
  const alreadyInvited = (m: Member) => Boolean(current?.participants.some(p => p.user_id === m.user_id));
  const toggleable = invitableMembers.filter(m => !alreadyInvited(m));
  const [selected, setSelected] = useState<number[]>(() => Array.from(new Set([
    ...(current?.participants.map(p => p.user_id) ?? []),
    ...initialParticipants,
  ])));
  const allSelected = toggleable.length > 0 && toggleable.every(m => selected.includes(m.user_id));
  const toggleAll = () => {
    const ids = toggleable.map(m => m.user_id);
    setSelected(prev => allSelected
      ? prev.filter(id => !ids.includes(id))
      : Array.from(new Set([...prev, ...ids])));
  };
  const [repeat, setRepeat] = useState("none");
  const [endMode, setEndMode] = useState("count");
  const [allDay, setAllDay] = useState(current?.all_day || false);
  const [scope,setScope] = useState<EventScope>("this");
  const started = current ? Date.parse(current.start_at) <= now && scope === "this" : false;
  const [conflicts, setConflicts] = useState<{display_name:string; start_at:string; title:string|null}[]>([]);
  const [retry, setRetry] = useState<(() => Promise<unknown>) | null>(null);
  const start = localInput(current?.start_at || initial || new Date(now+3600000).toISOString(), timezone);
  const end = localInput(current?.end_at || initialEnd || new Date(Date.parse(initial || new Date().toISOString())+7200000).toISOString(), timezone);
  return <div className="modal-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-label={current ? "编辑活动" : "新建活动"}>
    <h3>{current ? "编辑活动" : "新建活动"}</h3>
    {started && <p className="event-edit-hint">活动已开始，按规则不能修改开始/结束时间与地点；标题、描述、颜色、可见性仍可编辑。</p>}
    <form className="work-form" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const save = async (force = false) => {
        const startLocal = String(f.get("start")); const endLocal = String(f.get("end"));
        const data: EventInput = {title:String(f.get("title")), description:String(f.get("description")),
          start_at:toUtc(allDay ? `${startLocal}T00:00` : startLocal, timezone),
          end_at:toUtc(allDay ? `${shiftDate(endLocal,1)}T00:00` : endLocal, timezone),
          all_day:allDay, location:String(f.get("location")), color:String(f.get("color")),
          visibility:String(f.get("visibility")) as "team" | "private",
          participant_ids:selected.filter(id => id !== currentUserId), ignore_conflicts:force};
        if (!current && repeat !== "none") data.recurrence = {
          frequency:repeat as "weekly" | "biweekly",
          ...(endMode === "count" ? {count:Number(f.get("repeatCount"))} : {until:String(f.get("repeatUntil"))}),
        };
        try {
          if(current) {
            // 未编辑墙上时间时保留原UTC秒/微秒，避免仅改标题也误触发重新确认。
            if(!allDay && startLocal === localInput(current.start_at,timezone)) data.start_at = current.start_at;
            if(!allDay && endLocal === localInput(current.end_at,timezone)) data.end_at = current.end_at;
            const latest = await getEvent(current.id);
            if(latest.updated_at !== current.updated_at && !window.confirm("活动已被他人修改，确定覆盖？")) return;
            const {participant_ids, recurrence: _recurrence, ...changes} = data;
            void _recurrence;
            // 开始后的活动仅发送可编辑字段。
            if(started) {
              delete (changes as Partial<typeof changes>).start_at;
              delete (changes as Partial<typeof changes>).end_at;
              delete (changes as Partial<typeof changes>).location;
            }
            await updateEvent(current.id, {...changes, scope:String(f.get("scope") || "this") as EventScope});
            const added = participant_ids.filter(uid => !current.participants.some(p => p.user_id === uid));
            if(added.length) await inviteParticipants(current.id, added);
          } else await createEvent(teamId, data);
          onClose();
        } catch(err) {
          if(err instanceof ApiError && err.code === "TIME_CONFLICT") {
            setConflicts((err.details as {conflicts: typeof conflicts}).conflicts);
            setRetry(() => () => save(true));
          } else throw err;
        }
      };
      void action.run(() => save()).catch(() => {});
    }}>
      {current?.series_id && <label>修改范围<select name="scope" value={scope} onChange={e => setScope(e.target.value as EventScope)}><option value="this">仅本次</option><option value="future">本次及以后（未开始）</option><option value="all">整个系列（未开始）</option></select></label>}
      {!current && <><label>重复规则<select value={repeat} onChange={e => setRepeat(e.target.value)}><option value="none">不重复</option><option value="weekly">每周</option><option value="biweekly">每双周</option></select></label>{repeat !== "none" && <><label>重复结束条件<select value={endMode} onChange={e => setEndMode(e.target.value)}><option value="count">按次数</option><option value="until">按结束日期</option></select></label>{endMode === "count" ? <label>重复次数<input type="number" name="repeatCount" min={1} max={52} defaultValue={4} required /></label> : <label>重复结束日期<input type="date" name="repeatUntil" defaultValue={shiftDate(start.slice(0,10),28)} required /></label>}<p className="muted">最多52次且一年内；保持团队时区钟点，每次独立邀请和提醒。</p></>}</>}
      <label>活动标题<input name="title" defaultValue={current?.title} maxLength={100} required autoFocus /></label>
      <label><input type="checkbox" checked={allDay} disabled={started} onChange={e => setAllDay(e.target.checked)} />全天活动</label>
      <label>开始时间<input key={`start-${allDay}`} name="start" readOnly={started} type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? start.slice(0,10) : start} required /></label>
      <label>{allDay ? "结束日期（含当天）" : "结束时间"}<input key={`end-${allDay}`} name="end" readOnly={started} type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? (current?.all_day ? shiftDate(end.slice(0,10),-1) : end.slice(0,10)) : end} required /></label>
      <label>地点<input name="location" readOnly={started} defaultValue={current?.location || ""} /></label>
      <label>活动描述<textarea name="description" maxLength={2000} defaultValue={current?.description || ""} /></label>
      <label>活动颜色<input type="color" name="color" defaultValue={current?.color || "#4f46e5"} /></label>
      <label>可见性<select name="visibility" defaultValue={current?.visibility || "team"}><option value="team">团队可见</option><option value="private">私密（仅组织者和参与者）</option></select></label>
      <fieldset><legend>邀请成员</legend>
        <div className="participant-tools"><button type="button" className="btn btn-ghost" disabled={toggleable.length === 0} onClick={toggleAll}>{allSelected ? "取消邀请全员" : "邀请全员"}</button></div>
        <div className="participant-list">
          {invitableMembers.map(m => <label className="participant-option" key={m.user_id}>
            <input name="participants" type="checkbox" value={m.user_id} aria-label={m.display_name} disabled={alreadyInvited(m)} checked={selected.includes(m.user_id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, m.user_id] : prev.filter(id => id !== m.user_id))} />
            <span className="member-avatar participant-avatar" aria-hidden="true">{Array.from(m.display_name)[0] ?? "?"}</span>
            <span>{m.display_name}</span>
          </label>)}
          {invitableMembers.length === 0 && <p className="muted">暂无其他成员可邀请。</p>}
        </div>
      </fieldset>
      {!!conflicts.length && <section role="alert" className="conflict-box"><h4>时间冲突</h4>{conflicts.map((c,i) => <p key={i}>{c.display_name}：{c.title || "忙碌"} · {localInput(c.start_at,timezone).replace("T"," ")}</p>)}<button type="button" className="btn btn-danger" disabled={action.pending} onClick={() => {if(retry) void action.run(retry).catch(() => {});}}>仍然{current ? "保存" : "创建"}</button><button type="button" className="btn btn-secondary" onClick={() => {setConflicts([]); setRetry(null);}}>修改时间</button></section>}
      <div className="panel-actions"><button className="btn btn-primary" disabled={action.pending}>保存活动</button><button type="button" className="btn btn-secondary" onClick={onClose}>取消</button></div>
    </form>
  </section></div>;
}
