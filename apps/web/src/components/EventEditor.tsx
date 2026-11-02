import { useNow } from "../hooks/useNow";
import { ApiError, createEvent, getEvent, inviteParticipants, localInput, shiftDate, toUtc, updateEvent, type CalendarEvent, type EventInput, type Member } from "@teamsync/shared";
import { useState } from "react";
import { useAction } from "../hooks/useWork";

export default function EventEditor({teamId, timezone, members, current, initial, onClose}: {
  teamId: number; timezone: string; members: Member[]; current?: CalendarEvent;
  initial?: string; onClose: () => void;
}) {
  const now = useNow();
  const action = useAction();
  const [allDay, setAllDay] = useState(current?.all_day || false);
  const [conflicts, setConflicts] = useState<{display_name:string; start_at:string; title:string|null}[]>([]);
  const [retry, setRetry] = useState<(() => Promise<unknown>) | null>(null);
  const start = localInput(current?.start_at || initial || new Date(now+3600000).toISOString(), timezone);
  const end = localInput(current?.end_at || new Date(Date.parse(initial || new Date().toISOString())+7200000).toISOString(), timezone);
  return <div className="modal-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-label={current ? "编辑活动" : "新建活动"}>
    <h3>{current ? "编辑活动" : "新建活动"}</h3>
    <form className="work-form" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const save = async (force = false) => {
        const startLocal = String(f.get("start")); const endLocal = String(f.get("end"));
        const data: EventInput = {title:String(f.get("title")), description:String(f.get("description")),
          start_at:toUtc(allDay ? `${startLocal}T00:00` : startLocal, timezone),
          end_at:toUtc(allDay ? `${shiftDate(endLocal,1)}T00:00` : endLocal, timezone),
          all_day:allDay, location:String(f.get("location")), color:String(f.get("color")),
          visibility:String(f.get("visibility")) as "team" | "private",
          participant_ids:f.getAll("participants").map(Number), ignore_conflicts:force};
        try {
          if(current) {
            const latest = await getEvent(current.id);
            if(latest.updated_at !== current.updated_at && !window.confirm("活动已被他人修改，确定覆盖？")) return;
            const {participant_ids, ...changes} = data;
            // 开始后的活动仅发送可编辑字段。
            if(Date.parse(current.start_at) <= now) {
              delete (changes as Partial<typeof changes>).start_at;
              delete (changes as Partial<typeof changes>).end_at;
              delete (changes as Partial<typeof changes>).location;
            }
            await updateEvent(current.id, changes);
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
      <label>活动标题<input name="title" defaultValue={current?.title} maxLength={100} required autoFocus /></label>
      <label><input type="checkbox" checked={allDay} disabled={!!current && Date.parse(current.start_at) <= now} onChange={e => setAllDay(e.target.checked)} />全天活动</label>
      <label>开始时间<input key={`start-${allDay}`} name="start" readOnly={!!current && Date.parse(current.start_at) <= now} type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? start.slice(0,10) : start} required /></label>
      <label>{allDay ? "结束日期（含当天）" : "结束时间"}<input key={`end-${allDay}`} name="end" readOnly={!!current && Date.parse(current.start_at) <= now} type={allDay ? "date" : "datetime-local"} defaultValue={allDay ? (current?.all_day ? shiftDate(end.slice(0,10),-1) : end.slice(0,10)) : end} required /></label>
      <label>地点<input name="location" readOnly={!!current && Date.parse(current.start_at) <= now} defaultValue={current?.location || ""} /></label>
      <label>活动描述<textarea name="description" maxLength={2000} defaultValue={current?.description || ""} /></label>
      <label>活动颜色<input type="color" name="color" defaultValue={current?.color || "#4f46e5"} /></label>
      <label>可见性<select name="visibility" defaultValue={current?.visibility || "team"}><option value="team">团队可见</option><option value="private">私密（仅组织者和参与者）</option></select></label>
      <fieldset><legend>邀请成员</legend>{members.map(m => <label key={m.user_id}><input name="participants" type="checkbox" value={m.user_id} disabled={current?.participants.some(p => p.user_id === m.user_id)} defaultChecked={current?.participants.some(p => p.user_id === m.user_id)} />{m.display_name}</label>)}</fieldset>
      {action.error && <p role="alert">{action.error}</p>}
      {!!conflicts.length && <section role="alert" className="conflict-box"><h4>时间冲突</h4>{conflicts.map((c,i) => <p key={i}>{c.display_name}：{c.title || "忙碌"} · {localInput(c.start_at,timezone).replace("T"," ")}</p>)}<button type="button" className="btn btn-danger" disabled={action.pending} onClick={() => {if(retry) void action.run(retry).catch(() => {});}}>仍然{current ? "保存" : "创建"}</button><button type="button" className="btn btn-secondary" onClick={() => {setConflicts([]); setRetry(null);}}>修改时间</button></section>}
      <div className="panel-actions"><button className="btn btn-primary" disabled={action.pending}>保存活动</button><button type="button" className="btn btn-secondary" onClick={onClose}>取消</button></div>
    </form>
  </section></div>;
}
