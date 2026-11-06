import { useQuery } from "@tanstack/react-query";
import { calendarDate, calendarUtc, dateRange, formatTime, getAvailability, listEvents, listMembers, listTasks, localInput, shiftDate, toUtc, type CalendarEvent } from "@teamsync/shared";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type HeaderProps, type ToolbarProps, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useNavigate, useParams } from "react-router-dom";
import CalendarTimeline from "../components/CalendarTimeline";
import EventEditor from "../components/EventEditor";
import { useMe, useTeam } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";

const localizer = dateFnsLocalizer({format,parse,startOfWeek:(d:Date) => startOfWeek(d,{weekStartsOn:1}),getDay,locales:{"zh-CN":zhCN}});
interface Item { id:string; title:string; start:Date; end:Date; allDay:boolean; color:string; event?:CalendarEvent; taskId?:number; }
export function CalendarToolbar({ label, view, onNavigate, onView }: Pick<ToolbarProps<Item>, "label" | "view" | "onNavigate" | "onView">) {
  return <div className="calendar-toolbar">
    <div className="calendar-navigation">
      <h3 aria-live="polite">{label}</h3>
      <div className="calendar-arrows">
        <button type="button" aria-label="上一页" onClick={() => onNavigate("PREV")}><span aria-hidden="true">‹</span></button>
        <button type="button" aria-label="下一页" onClick={() => onNavigate("NEXT")}><span aria-hidden="true">›</span></button>
      </div>
      <button type="button" className="calendar-today" onClick={() => onNavigate("TODAY")}>今天</button>
    </div>
    <div className="calendar-views" role="group" aria-label="日历视图">
      {([['month', '月'], ['week', '周'], ['day', '日']] as const).map(([value, text]) =>
        <button type="button" key={value} aria-pressed={view === value} onClick={() => onView(value)}>{text}</button>)}
    </div>
  </div>;
}

export function CalendarDayHeader({ date }: HeaderProps) {
  return <span className="calendar-day-heading">
    <span className="calendar-weekday">{format(date, "EEEE", {locale:zhCN})}</span>
    <span className="calendar-day-number">{format(date, "dd")}</span>
  </span>;
}

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
  return <section className="panel calendar-panel" aria-label="团队日历">
    <header className="calendar-heading">
      <div><p className="eyebrow">TEAM CALENDAR</p><h2>日历</h2><p className="muted">让团队的每一次安排，都井然有序。</p></div>
      <button className="btn btn-primary" onClick={() => setInitial(toUtc(`${date}T09:00`,zone))}><span aria-hidden="true">＋</span>新建活动</button>
    </header>
    <div className="calendar-filters">
      <label className="calendar-member">成员筛选<select value={member} onChange={e => setMember(e.target.value)}><option value="">全部成员</option><option value={me?.id}>仅我 / 我的活动</option>{members.data?.items.filter(m => m.user_id !== me?.id).map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
      <label className="calendar-busy"><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} /><span>显示周忙闲</span></label>
      <span className="calendar-timezone">时区 · {zone}</span>
    </div>
    {!!error && <p className="banner banner-error" role="alert">{friendlyMessage(error)} <button onClick={() => {void events.refetch(); void tasks.refetch();}}>重试</button></p>}
    {events.isPending && <p className="calendar-loading" role="status">日历加载中…</p>}
    <div className={`calendar-scroll view-${view}`}>
    {view !== "month" ? <>
      <CalendarToolbar label={view === "day" ? format(new Date(`${date}T12:00`),"yyyy年 M月d日") : `${format(new Date(`${days[0]}T12:00`),"yyyy年 M月d日")} – ${format(new Date(`${days[days.length-1]}T12:00`),"M月d日")}`} view={view}
        onNavigate={action => setDate(action === "TODAY" ? localInput(new Date().toISOString(),zone).slice(0,10) : shiftDate(date,(action === "PREV" ? -1 : 1) * (view === "week" ? 7 : 1)))}
        onView={next => setView(next as typeof view)} />
      <CalendarTimeline days={days} items={items} today={localInput(new Date().toISOString(),zone).slice(0,10)}
        backgroundItems={busy ? (availability.data?.members || []).flatMap(m => m.blocks.map((b,i) => ({id:`busy-${m.user_id}-${i}`,title:`${m.display_name} · ${b.title || "忙碌"}`,start:calendarDate(b.start_at,zone),end:calendarDate(b.end_at,zone),allDay:b.all_day,color:"#64748b"}))) : []}
        onCreate={start => setInitial(calendarUtc(start,zone))}
        onSelect={item => navigate(`/app/teams/${id}/${item.event ? `events/${item.event.id}` : `tasks?task=${item.taskId}`}`)} />
    </> : <Calendar<Item>
      components={{toolbar:CalendarToolbar, week:{header:CalendarDayHeader}, day:{header:CalendarDayHeader}}}
      scrollToTime={new Date(1970,0,1,8)}
      formats={{timeGutterFormat:"HH:mm",eventTimeRangeFormat:({start,end}) => `${format(start,"HH:mm")} – ${format(end,"HH:mm")}`,dayRangeHeaderFormat:({start,end}) => `${format(start,"yyyy年 M月d日")} – ${format(end,"M月d日")}`}}
      localizer={localizer} culture="zh-CN" date={new Date(`${date}T12:00`)} view={view} views={["month","week","day"]}
      events={items}
      backgroundEvents={busy ? (availability.data?.members || []).flatMap(m => m.blocks.map((b,i) => ({id:`busy-${m.user_id}-${i}`, title:`${m.display_name} · ${b.title || "忙碌"}`,start:calendarDate(b.start_at,zone),end:calendarDate(b.end_at,zone),allDay:b.all_day,color:"#64748b"}))) : []}
      startAccessor="start" endAccessor="end" selectable popup
      onNavigate={d => setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)}
      onView={v => setView(v as View as typeof view)}
      onSelectSlot={slot => setInitial(calendarUtc(slot.start,zone))}
      onSelectEvent={item => navigate(`/app/teams/${id}/${item.event ? `events/${item.event.id}` : `tasks?task=${item.taskId}`}`)}
      eventPropGetter={item => ({style:{backgroundColor:`color-mix(in srgb, ${item.color} 10%, white)`,color:item.color,borderColor:`color-mix(in srgb, ${item.color} 22%, white)`,borderLeftColor:item.color}})}
      messages={{today:"今天",previous:"上一页",next:"下一页",month:"月",week:"周",day:"日",agenda:"日程",date:"日期",time:"时间",event:"活动",allDay:"全天 / 截止",noEventsInRange:"本时段暂无活动",showMore:n => `另 ${n} 项`}}
      style={{height:700}}
    />}</div>
    <footer className="calendar-footer">
      <div className="calendar-legend" aria-label="日历图例"><span><i className="legend-event" />活动（按自定义颜色）</span><span><i className="legend-task" />任务截止</span><span><i className="legend-overdue" />逾期</span><span><i className="legend-done" />已完成</span></div>
      <span>点击空白日期，安排新活动</span>
    </footer>
    {busy && <section className="calendar-availability"><h3>本周成员忙闲</h3>{availability.isPending && <p>忙闲加载中…</p>}<div className="availability-grid">{availability.data?.members.map(m => <article key={m.user_id}><h4>{m.display_name}</h4>{!m.blocks.length && <p className="muted">本周暂无安排</p>}{m.blocks.map((b,i) => <button className="busy-block" key={i} onClick={() => {if(b.event_id) navigate(`/app/teams/${id}/events/${b.event_id}`);}}>{b.title || "忙碌"}<br/>{b.all_day ? "全天" : `${formatTime(b.start_at,zone)} — ${formatTime(b.end_at,zone)}`}</button>)}</article>)}</div></section>}
    {initial && <EventEditor teamId={id} timezone={zone} members={members.data?.items || []} initial={initial} onClose={() => setInitial(null)} />}
  </section>;
}
