import { useQuery } from "@tanstack/react-query";
import { calendarDate, calendarUtc, dateRange, formatTime, getAvailability, listEvents, listMembers, listTasks, localInput, shiftDate, toUtc, type CalendarEvent } from "@teamsync/shared";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Link, useNavigate, useParams } from "react-router-dom";
import EventEditor from "../components/EventEditor";
import { useMe, useTeam } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";

const localizer = dateFnsLocalizer({format,parse,startOfWeek:(d:Date) => startOfWeek(d,{weekStartsOn:1}),getDay,locales:{"zh-CN":zhCN}});
interface Item { id:string; title:string; label:string; timeLabel:string; start:Date; end:Date; allDay:boolean; color:string; event?:CalendarEvent; taskId?:number; }

function CalendarEventBlock({ event }: { event: Item }) {
  return <span className="cal-event"><strong>{event.label}</strong>{event.timeLabel ? <small>{event.timeLabel}</small> : null}</span>;
}

export default function CalendarPage() {
  const id = Number(useParams().teamId); const team = useTeam(id).data; const me = useMe().data;
  const zone = team?.timezone || "Asia/Shanghai";
  const [date,setDate] = useState(() => localInput(new Date().toISOString(),zone).slice(0,10));
  const [view,setView] = useState<"month"|"week"|"day">("week");
  const [member,setMember] = useState(""); const [busy,setBusy] = useState(true);
  const [initial,setInitial] = useState<string | null>(null); const navigate = useNavigate();
  const days = dateRange(date,view); const from = toUtc(`${days[0]}T00:00`,zone);
  const to = toUtc(`${shiftDate(days[days.length-1],1)}T00:00`,zone);
  const events = useQuery({queryKey:["events",id,from,to,member],queryFn:() => listEvents(id,from,to,member ? Number(member) : undefined)});
  const tasks = useQuery({queryKey:["tasks",id],queryFn:() => listTasks(id)});
  const members = useQuery({queryKey:["members",id],queryFn:() => listMembers(id)});
  const busyDays = dateRange(date,"week");
  const availability = useQuery({queryKey:["availability",id,date,member],queryFn:() => getAvailability(id,toUtc(`${busyDays[0]}T00:00`,zone),toUtc(`${shiftDate(busyDays[6],1)}T00:00`,zone),member ? Number(member) : undefined),enabled:busy});
  const items = useMemo<Item[]>(() => [
    ...(events.data?.items || []).filter(e => e.status !== "cancelled").map(e => {
      const eventTime = e.all_day ? "全天" : `${formatTime(e.start_at,zone).split(" ").at(-1)}–${formatTime(e.end_at,zone).split(" ").at(-1)}`;
      return {id:`e${e.id}`, title:`${e.title} ${eventTime}`, label:e.title, timeLabel:eventTime, start:calendarDate(e.start_at,zone),end:calendarDate(e.end_at,zone),allDay:e.all_day,color:e.color || "#4f46e5",event:e};
    }),
    ...(tasks.data?.items || []).filter(t => !member || t.assignee_id === Number(member)).map(t => {
      const day = localInput(t.due_at,zone).slice(0,10);
      const due = formatTime(t.due_at,zone).split(" ").at(-1) ?? "";
      return {id:`t${t.id}`,title:`任务 · ${t.title} 截止 ${due}`, label:`任务 · ${t.title}`, timeLabel:`截止 ${due}`, start:new Date(`${day}T00:00`),end:new Date(`${shiftDate(day,1)}T00:00`),allDay:true,color:t.status === "done" ? "#16804a" : t.overdue ? "#b42318" : "#475569",taskId:t.id};
    }),
  ],[events.data,tasks.data,member,zone]);
  const error = events.error || tasks.error || members.error || (busy && availability.error);
  const visibleEvents = events.data?.items ?? [];
  const invites = visibleEvents.filter(e => e.status === "confirmed" && e.my_response === "pending");
  const taskItems = tasks.data?.items ?? [];
  const openTasks = taskItems.filter(t => t.status !== "done").length;
  const privateBlocks = (availability.data?.members || []).flatMap(m => m.blocks.filter(b => b.title === null).map(b => ({ ...b, memberName: m.display_name })));
  const uniquePrivate = (blocks: typeof privateBlocks) => Array.from(new Map(blocks.map(b => [`${b.start_at}-${b.end_at}`, b])).values());
  const privateAllDay = uniquePrivate(privateBlocks.filter(b => b.all_day));
  const privateTimed = uniquePrivate(privateBlocks.filter(b => !b.all_day));
  const monthLabel = format(new Date(`${date}T12:00`), "yyyy年M月", {locale:zhCN});
  const todayLabel = format(new Date(), "M月d日 EEEE", {locale:zhCN});

  return <section className="calendar-page">
    <div className="calendar-card">
      <div className="calendar-head">
        <div>
          <p className="eyebrow">团队空间</p>
          <h2>团队日历</h2>
          <p>{monthLabel} · {visibleEvents.length} 个活动 · {members.data?.items.length ?? 0} 位成员</p>
        </div>
        <div className="calendar-tools">
          <button className="btn btn-primary" onClick={() => setInitial(toUtc(`${date}T09:00`,zone))}>新建活动</button>
        </div>
      </div>
      <div className="calendar-filterbar">
        <label>成员筛选<select value={member} onChange={e => setMember(e.target.value)}><option value="">全部成员</option><option value={me?.id}>仅我 / 我的活动</option>{members.data?.items.filter(m => m.user_id !== me?.id).map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
        <label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} />显示周忙闲</label>
        <span className="calendar-legend">显示 08:00–22:00 · 斜纹 = 私密忙碌 · {zone} · 彩色为活动 · 灰色为任务截止 · 红色为逾期 · 绿色为完成</span>
      </div>
      {privateAllDay.length > 0 ? <p className="private-busy-note">有 {privateAllDay.length} 个全天私密忙碌，仅计入右侧统计，不在时间轴显示标题。</p> : null}
      {!!error && <p role="alert" className="calendar-error">{friendlyMessage(error)} <button className="btn btn-sm btn-secondary" onClick={() => {void events.refetch(); void tasks.refetch();}}>重试</button></p>}
      {events.isPending && <p className="calendar-loading">日历加载中…</p>}
      <div className={`calendar-scroll view-${view}`}><Calendar<Item>
        localizer={localizer} culture="zh-CN" date={new Date(`${date}T12:00`)} view={view} views={["month","week","day"]}
        events={items}
        backgroundEvents={busy ? privateTimed.map((b,i) => ({id:`busy-${b.memberName}-${i}`, title:"私密忙碌",label:"私密忙碌",timeLabel:"",start:calendarDate(b.start_at,zone),end:calendarDate(b.end_at,zone),allDay:false,color:"#64748b"})) : []}
        startAccessor="start" endAccessor="end" selectable popup step={60} timeslots={1}
        min={calendarDate(toUtc(`${date}T08:00`,zone),zone)}
        max={calendarDate(toUtc(`${date}T22:00`,zone),zone)}
        scrollToTime={calendarDate(toUtc(`${date}T08:00`,zone),zone)}
        dayLayoutAlgorithm="no-overlap"
        components={{ event: CalendarEventBlock }}
        onNavigate={d => setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)}
        onView={v => setView(v as View as typeof view)}
        onSelectSlot={slot => setInitial(calendarUtc(slot.start,zone))}
        onSelectEvent={item => navigate(`/app/teams/${id}/${item.event ? `events/${item.event.id}` : `tasks?task=${item.taskId}`}`)}
        eventPropGetter={item => ({style:{backgroundColor:item.color,borderColor:item.color}})}
        messages={{today:"今天",previous:"上一页",next:"下一页",month:"月",week:"周",day:"日",agenda:"日程",date:"日期",time:"时间",event:"活动",allDay:"全天 / 截止",noEventsInRange:"本时段暂无活动",showMore:n => `另 ${n} 项`}}
        style={{height:700}}
      /></div>
    </div>

    <aside className="calendar-side">
      <section className="side-card today-card">
        <p className="side-eyebrow">今天 · 演示日</p>
        <h2>{todayLabel}</h2>
        <p>{visibleEvents.length} 个活动 · {openTasks} 个待办</p>
        <button className="btn btn-sm today-button" onClick={() => setDate(localInput(new Date().toISOString(),zone).slice(0,10))}>查看今日 →</button>
      </section>

      <section className="side-card">
        <div className="side-card-head"><h3>待回应邀请 <span className="side-count">{invites.length}</span></h3><Link to="/app/notifications">通知中心</Link></div>
        {invites.length === 0 ? <p className="side-empty">暂无待回应邀请</p> : invites.slice(0, 3).map(e => <Link className="side-invite" key={e.id} to={`/app/teams/${id}/events/${e.id}`}><span className="side-invite-icon">邀</span><span><strong>{e.title}</strong><small>{formatTime(e.start_at, zone)}</small></span></Link>)}
      </section>

      <section className="side-card">
        <div className="side-card-head"><h3>本周任务 <span className="side-count">{taskItems.length}</span></h3><Link to={`/app/teams/${id}/tasks`}>看板</Link></div>
        {taskItems.length === 0 ? <p className="side-empty">本周暂无任务</p> : taskItems.slice(0, 4).map(t => <Link className="side-task" key={t.id} to={`/app/teams/${id}/tasks?task=${t.id}`}><span className={`side-status ${t.status}${t.overdue ? " overdue" : ""}`} aria-hidden="true" /><span><strong>{t.title}</strong><small>{formatTime(t.due_at, zone)}</small></span></Link>)}
      </section>

      <section className="side-card">
        <div className="side-card-head"><h3>本周成员忙闲</h3><span className="side-count">{members.data?.items.length ?? 0} 人</span></div>
        {busy ? (availability.isPending ? <p className="side-empty">忙闲加载中…</p> : (availability.data?.members || []).map(m => <div className="busy-row" key={m.user_id}><span>{m.display_name}</span><span className="busy-track"><span style={{width:`${Math.min(100, m.blocks.length * 22)}%`}} /></span><small>{m.blocks.length ? `${m.blocks.length} 段` : "空闲"}</small></div>)) : <p className="side-empty">勾选“显示周忙闲”查看</p>}
      </section>
    </aside>

    {initial && <EventEditor teamId={id} timezone={zone} members={members.data?.items || []} initial={initial} onClose={() => setInitial(null)} />}
  </section>;
}
