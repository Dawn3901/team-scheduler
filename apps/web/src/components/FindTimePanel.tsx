import { formatTime, shiftDate, suggestTimes, toUtc, type Member, type TimeSuggestion } from "@teamsync/shared";
import { useState } from "react";
import { useAction } from "../hooks/useWork";

export default function FindTimePanel({teamId, timezone, date, members, onSelect, onClose}: {
  teamId:number; timezone:string; date:string; members:Member[];
  onSelect:(slot:TimeSuggestion, members:number[]) => void; onClose:() => void;
}) {
  const action = useAction();
  const [results, setResults] = useState<TimeSuggestion[] | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  return <div className="modal-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-label="智能找空闲">
    <h3>智能找空闲</h3><p className="muted">必到成员全部空闲才推荐；可选成员出席越多，评分越高。时间按 {timezone}。</p>
    <form className="work-form" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const selected = members.filter(m => f.get(`member-${m.user_id}`) !== "exclude");
      const required = selected.filter(m => f.get(`member-${m.user_id}`) === "required");
      setResults(null);
      void action.run(async () => {
        const result = await suggestTimes(teamId, {from:toUtc(`${f.get("from")}T00:00`,timezone),
          to:toUtc(`${shiftDate(String(f.get("to")),1)}T00:00`,timezone),
          duration_minutes:Number(f.get("duration")), member_ids:selected.map(m => m.user_id),
          required_ids:required.map(m => m.user_id), work_start:String(f.get("work_start")),
          work_end:String(f.get("work_end")), buffer_minutes:Number(f.get("buffer")), include_weekend:f.has("weekend")});
        setChosen(selected.map(m => m.user_id)); setResults(result.suggestions);
      }).catch(() => {});
    }}>
      <div className="extension-columns"><label>起始日期<input type="date" name="from" defaultValue={date} required /></label><label>结束日期（含当天）<input type="date" name="to" defaultValue={shiftDate(date,6)} required /></label></div>
      <div className="extension-columns"><label>会议时长（分钟）<input type="number" name="duration" min={15} max={480} defaultValue={60} required /></label><label>前后缓冲（分钟）<input type="number" name="buffer" min={0} max={60} defaultValue={0} required /></label></div>
      <div className="extension-columns"><label>工作开始<input type="time" name="work_start" defaultValue="09:00" required /></label><label>工作结束<input type="time" name="work_end" defaultValue="18:00" required /></label></div>
      <label><input type="checkbox" name="weekend" />包含周末</label>
      <fieldset><legend>成员出席要求</legend>{members.map(m => <label key={m.user_id}>{m.display_name}<select name={`member-${m.user_id}`} defaultValue="required"><option value="required">必到</option><option value="optional">可选</option><option value="exclude">不参与</option></select></label>)}</fieldset>
      <button className="btn btn-primary" disabled={action.pending}>{action.pending ? "计算中…" : "推荐时间"}</button>
    </form>
    {results?.length === 0 && <p role="status">没有满足条件的时段，请调整日期、时长或必到成员。</p>}
    {results?.map(slot => <article className="suggestion-card" key={slot.start_at}><strong>{formatTime(slot.start_at,timezone)} — {formatTime(slot.end_at,timezone)}</strong><p>评分 {Math.round(slot.score*100)} · {slot.reasons.join("；")}</p><p>可参加：{members.filter(m => slot.available_member_ids.includes(m.user_id)).map(m => m.display_name).join("、")}</p>{slot.missing_optional_ids.length > 0 && <p>可选成员忙碌：{members.filter(m => slot.missing_optional_ids.includes(m.user_id)).map(m => m.display_name).join("、")}</p>}<button className="btn btn-secondary" onClick={() => onSelect(slot,chosen)}>用此时段创建活动</button></article>)}
    <button className="btn btn-ghost" onClick={onClose}>关闭找空闲</button>
  </section></div>;
}
