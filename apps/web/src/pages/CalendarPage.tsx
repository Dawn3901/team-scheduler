import { useQuery } from "@tanstack/react-query";
import { calendarDate, calendarUtc, dateRange, formatTime, getAvailability, listEvents, listMembers, listTasks, localInput, shiftDate, toUtc, type CalendarEvent } from "@teamsync/shared";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useNavigate, useParams } from "react-router-dom";
import EventEditor from "../components/EventEditor";
import { useMe, useTeam } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";

const localizer = dateFnsLocalizer({format,parse,startOfWeek:(d:Date) => startOfWeek(d,{weekStartsOn:1}),getDay,locales:{"zh-CN":zhCN}});
interface Item { id:string; title:string; start:Date; end:Date; allDay:boolean; color:string; event?:CalendarEvent; taskId?:number; }
export default function CalendarPage() {
  const id = Number(useParams().teamId); const team = useTeam(id).data; const me = useMe().data;
  const zone = team?.timezone || "Asia/Shanghai";
  const [date,setDate] = useState(() => localInput(new Date().toISOString(),zone).slice(0,10));
  const [view,setView] = useState<"month"|"week"|"day">("month");
  const [member,setMember] = useState(""); const [busy,setBusy] = useState(false);
  const [initial,setInitial] = useState<string | null>(null); const navigate = useNavigate();
  const days = dateRange(date,view); const from = toUtc(`${days[0]}T00:00`,zone);
  const to = toUtc(`${shiftDate(days[days.length-1],1)}T00:00`,zone);
  const events = useQuery({queryKey:["events",id,from,to,member],queryFn:() => listEvents(id,from,to,member ? Number(member) : undefined)});
  const tasks = useQuery({queryKey:["tasks",id],queryFn:() => listTasks(id)});
  const members = useQuery({queryKey:["members",id],queryFn:() => listMembers(id)});
  const busyDays = dateRange(date,"week");
  const availability = useQuery({queryKey:["availability",id,date,member],queryFn:() => getAvailability(id,toUtc(`${busyDays[0]}T00:00`,zone),toUtc(`${shiftDate(busyDays[6],1)}T00:00`,zone),member ? Number(member) : undefined),enabled:busy});
  const items = useMemo<Item[]>(() => [
    ...(events.data?.items || []).filter(e => e.status !== "cancelled").map(e => ({id:`e${e.id}`, title:e.title,start:calendarDate(e.start_at,zone),end:calendarDate(e.end_at,zone),allDay:e.all_day,color:e.color || "#4f46e5",event:e})),
    ...(tasks.data?.items || []).filter(t => !member || t.assignee_id === Number(member)).map(t => {
      const day = localInput(t.due_at,zone).slice(0,10);
      return {id:`t${t.id}`,title:`截止 ${formatTime(t.due_at,zone).split(" ").at(-1)} · ${t.title}`,start:new Date(`${day}T00:00`),end:new Date(`${shiftDate(day,1)}T00:00`),allDay:true,color:t.status === "done" ? "#16804a" : t.overdue ? "#b42318" : "#475569",taskId:t.id};
    }),
  ],[events.data,tasks.data,member,zone]);
  const error = events.error || tasks.error || members.error || (busy && availability.error);
  return <section className="panel calendar-panel"><div className="work-toolbar"><h2>日历</h2><button className="btn btn-primary" onClick={() => setInitial(toUtc(`${date}T09:00`,zone))}>新建活动</button></div>
    <div className="work-toolbar"><label>成员筛选<select value={member} onChange={e => setMember(e.target.value)}><option value="">全部成员</option><option value={me?.id}>仅我 / 我的活动</option>{members.data?.items.filter(m => m.user_id !== me?.id).map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label><label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} />显示周忙闲</label><span className="muted">{zone} · 彩色为活动 · 灰色为任务截止 · 红色为逾期 · 绿色为完成</span></div>
    {!!error && <p role="alert">{friendlyMessage(error)} <button onClick={() => {void events.refetch(); void tasks.refetch();}}>重试</button></p>}
    {events.isPending && <p>日历加载中…</p>}
    <div className={`calendar-scroll view-${view}`}><Calendar<Item>
      localizer={localizer} culture="zh-CN" date={new Date(`${date}T12:00`)} view={view} views={["month","week","day"]}
      events={items}
      backgroundEvents={busy ? (availability.data?.members || []).flatMap(m => m.blocks.map((b,i) => ({id:`busy-${m.user_id}-${i}`, title:`${m.display_name} · ${b.title || "忙碌"}`,start:calendarDate(b.start_at,zone),end:calendarDate(b.end_at,zone),allDay:b.all_day,color:"#64748b"}))) : []}
      startAccessor="start" endAccessor="end" selectable popup
      onNavigate={d => setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)}
      onView={v => setView(v as View as typeof view)}
      onSelectSlot={slot => setInitial(calendarUtc(slot.start,zone))}
      onSelectEvent={item => navigate(`/app/teams/${id}/${item.event ? `events/${item.event.id}` : `tasks?task=${item.taskId}`}`)}
      eventPropGetter={item => ({style:{backgroundColor:item.color,borderColor:item.color}})}
      messages={{today:"今天",previous:"上一页",next:"下一页",month:"月",week:"周",day:"日",agenda:"日程",date:"日期",time:"时间",event:"活动",allDay:"全天 / 截止",noEventsInRange:"本时段暂无活动",showMore:n => `另 ${n} 项`}}
      style={{height:700}}
    /></div>
    {busy && <section><h3>本周成员忙闲</h3>{availability.isPending && <p>忙闲加载中…</p>}<div className="availability-grid">{availability.data?.members.map(m => <article key={m.user_id}><h4>{m.display_name}</h4>{!m.blocks.length && <p className="muted">本周暂无安排</p>}{m.blocks.map((b,i) => <button className="busy-block" key={i} onClick={() => {if(b.event_id) navigate(`/app/teams/${id}/events/${b.event_id}`);}}>{b.title || "忙碌"}<br/>{b.all_day ? "全天" : `${formatTime(b.start_at,zone)} — ${formatTime(b.end_at,zone)}`}</button>)}</article>)}</div></section>}
    {initial && <EventEditor teamId={id} timezone={zone} members={members.data?.items || []} initial={initial} onClose={() => setInitial(null)} />}
  </section>;
}
