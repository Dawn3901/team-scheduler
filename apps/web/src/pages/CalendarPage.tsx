import { useQuery } from "@tanstack/react-query";
import { calendarDate, calendarUtc, dateRange, formatTime, getAvailability, listEvents, listMembers, listTasks, localInput, shiftDate, toUtc, type CalendarEvent } from "@teamsync/shared";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calendar, dateFnsLocalizer, type ToolbarProps, type View } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import CalendarTimeline from "../components/CalendarTimeline";
import EventEditor from "../components/EventEditor";
import { useMe, useTeam } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";

const localizer = dateFnsLocalizer({format,parse,startOfWeek:(d:Date) => startOfWeek(d,{weekStartsOn:1}),getDay,locales:{"zh-CN":zhCN}});
interface Item { id:string; title:string; label:string; timeLabel:string; start:Date; end:Date; allDay:boolean; color:string; event?:CalendarEvent; taskId?:number; resourceId?:number; }
interface MemberResource { id:number; title:string; role:string; color:string; }

function CalendarEventBlock({ event }: { event: Item }) {
  return <span className="cal-event"><strong>{event.label}</strong>{event.timeLabel ? <small>{event.timeLabel}</small> : null}</span>;
}

function CalendarToolbar({ view, views, onNavigate, onView }: Pick<ToolbarProps<Item, MemberResource>, "view" | "views" | "onNavigate" | "onView">) {
  const viewLabel: Record<string,string> = { month:"月", week:"周", day:"日" };
  return <div className="cal-toolbar">
    <div className="cal-nav">
      <button type="button" className="icon-btn" aria-label="上一页" onClick={() => onNavigate("PREV")}><span aria-hidden="true">‹</span></button>
      <button type="button" className="btn btn-secondary" onClick={() => onNavigate("TODAY")}>今天</button>
      <button type="button" className="icon-btn" aria-label="下一页" onClick={() => onNavigate("NEXT")}><span aria-hidden="true">›</span></button>
    </div>
    <div className="cal-views">
      {(views as string[]).map(v => <button type="button" key={v} className={`cal-view${view === v ? " active" : ""}`} onClick={() => onView(v as View)}>{viewLabel[v] ?? v}</button>)}
    </div>
  </div>;
}

interface StoredCalendarState { view:"month"|"week"|"day"; date:string; member:string; busy:boolean; }

function readCalendarState(teamId:number): Partial<StoredCalendarState> | null {
  try {
    const raw = sessionStorage.getItem(`teamsync.calendar.ui.${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCalendarState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

function MemberResourceHeader({ label, resource }: { label: ReactNode; resource: MemberResource }) {
  const role = resource.role === "owner" ? "Owner" : resource.role === "admin" ? "Admin" : "成员";
  return <span className="resource-head"><span className="resource-avatar" style={{backgroundColor:resource.color}} aria-hidden="true">{String(label).slice(0,1)}</span><span><strong>{label}</strong><small>{role}</small></span></span>;
}

export default function CalendarPage() {
  const id = Number(useParams().teamId); const team = useTeam(id).data; const me = useMe().data;
  const zone = team?.timezone || "Asia/Shanghai";
  const saved = readCalendarState(id);
  const [date,setDate] = useState(() => saved?.date ?? localInput(new Date().toISOString(),zone).slice(0,10));
  const [view,setView] = useState<"month"|"week"|"day">(() => saved?.view === "month" || saved?.view === "day" ? saved.view : "week");
  const [member,setMember] = useState(() => saved?.member ?? ""); const [busy,setBusy] = useState(() => saved?.busy ?? true);
  const [initial,setInitial] = useState<string | null>(null); const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    try { sessionStorage.setItem(`teamsync.calendar.ui.${id}`, JSON.stringify({ view, date, member, busy })); } catch { /* storage can be unavailable */ }
  }, [id,view,date,member,busy]);
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
      const state = t.status === "done" ? "（已完成）" : t.overdue ? "（已逾期）" : "";
      const label = `任务 · ${t.title}${state}`;
      return {id:`t${t.id}`,title:`${label} 截止 ${due}`, label, timeLabel:`截止 ${due}`, start:new Date(`${day}T00:00`),end:new Date(`${shiftDate(day,1)}T00:00`),allDay:true,color:"#64748b",taskId:t.id};
    }),
  ],[events.data,tasks.data,member,zone]);
  const error = events.error || tasks.error || members.error || (busy && availability.error);
  const visibleEvents = events.data?.items ?? [];
  const invites = visibleEvents.filter(e => e.status === "confirmed" && e.my_response === "pending");
  const taskItems = tasks.data?.items ?? [];
  const openTasks = taskItems.filter(t => t.status !== "done").length;
  const today = localInput(new Date().toISOString(), zone).slice(0,10);
  const monthLabel = format(new Date(`${date}T12:00`), "yyyy年M月", {locale:zhCN});
  const periodLabel = view === "day"
    ? format(new Date(`${date}T12:00`), "M月d日 EEEE", {locale:zhCN})
    : view === "week"
      ? `${format(new Date(`${days[0]}T12:00`), "M月d日", {locale:zhCN})} – ${format(new Date(`${days[days.length-1]}T12:00`), "M月d日", {locale:zhCN})}`
      : monthLabel;
  const todayLabel = format(new Date(), "M月d日 EEEE", {locale:zhCN});
  const resourceColors = ["#6366f1", "#0f9f8f", "#d97706", "#db2777", "#2563eb"];
  const resources: MemberResource[] = (members.data?.items || []).map((m, i) => ({ id:m.user_id, title:m.display_name, role:m.role, color:resourceColors[i % resourceColors.length] }));
  const dayItems = useMemo<Item[]>(() => {
    if (view !== "day") return items;
    return items.flatMap(item => {
      if (item.event) {
        const ids = Array.from(new Set(item.event.participants.map(p => p.user_id)));
        return (ids.length ? ids : [item.event.created_by]).map(uid => ({ ...item, id:`${item.id}-u${uid}`, resourceId:uid }));
      }
      if (item.taskId) {
        const task = tasks.data?.items.find(t => t.id === item.taskId);
        return task?.assignee_id ? [{ ...item, id:`${item.id}-u${task.assignee_id}`, resourceId:task.assignee_id }] : [];
      }
      return [item];
    });
  }, [items, view, tasks.data]);

  return <section className="calendar-page">
    <div className="calendar-card">
      <div className="calendar-head">
        <div>
          <p className="eyebrow">团队空间</p>
          <h2>团队日历</h2>
          <p>{periodLabel} · {visibleEvents.length} 个活动 · {members.data?.items.length ?? 0} 位成员</p>
        </div>
        <div className="calendar-tools">
          <button className="btn btn-primary" onClick={() => setInitial(toUtc(`${date}T09:00`,zone))}>新建活动</button>
        </div>
      </div>
      <div className="calendar-filterbar">
        <label>成员筛选<select value={member} onChange={e => setMember(e.target.value)}><option value="">全部成员</option><option value={me?.id}>仅我 / 我的活动</option>{members.data?.items.filter(m => m.user_id !== me?.id).map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
        <label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} />显示周忙闲</label>
      </div>
      {!!error && <p role="alert" className="calendar-error">{friendlyMessage(error)} <button className="btn btn-sm btn-secondary" onClick={() => {void events.refetch(); void tasks.refetch();}}>重试</button></p>}
      {events.isPending && <p className="calendar-loading">日历加载中…</p>}
      <div className={`calendar-scroll view-${view}`}>
      {view !== "month" ? <>
        <CalendarToolbar view={view} views={["month","week","day"]}
          onNavigate={action => setDate(action === "TODAY" ? localInput(new Date().toISOString(),zone).slice(0,10) : shiftDate(view === "week" ? days[0] : date,(action === "PREV" ? -1 : 1) * (view === "week" ? 7 : 1)))}
          onView={next => setView(next as typeof view)} />
        <CalendarTimeline storageKey={`calendar-${id}`} days={days} items={dayItems} today={today}
          columns={view === "day" && resources.length ? resources.map(resource => ({id:`member-${resource.id}`,day:date,resourceId:resource.id,header:<MemberResourceHeader label={resource.title} resource={resource} />})) : undefined}
          backgroundItems={busy ? (availability.data?.members || []).flatMap(m => m.blocks.filter(b => b.title === null && !b.all_day).map((b,i) => ({id:`busy-${m.user_id}-${i}`,title:"私密忙碌",start:calendarDate(b.start_at,zone),end:calendarDate(b.end_at,zone),allDay:false,color:"#64748b",resourceId:m.user_id}))) : []}
          onCreate={start => setInitial(calendarUtc(start,zone))}
          onSelect={item => navigate(`/app/teams/${id}/${item.event ? `events/${item.event.id}` : `tasks?task=${item.taskId}`}`, { state: { fromCalendar: location.pathname } })} />
      </> : <Calendar<Item, MemberResource>
        localizer={localizer} culture="zh-CN" date={new Date(`${date}T12:00`)} view={view} views={["month","week","day"]}
        events={items}
        startAccessor="start" endAccessor="end" selectable popup step={60} timeslots={1}
        components={{ toolbar: CalendarToolbar, event: CalendarEventBlock }}
        onNavigate={d => setDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)}
        onView={v => setView(v as View as typeof view)}
        onSelectSlot={slot => setInitial(calendarUtc(slot.start,zone))}
        onSelectEvent={item => navigate(`/app/teams/${id}/${item.event ? `events/${item.event.id}` : `tasks?task=${item.taskId}`}`, { state: { fromCalendar: location.pathname } })}
        eventPropGetter={item => ({style:{backgroundColor:item.color,borderColor:item.color}})}
        messages={{today:"今天",previous:"上一页",next:"下一页",month:"月",week:"周",day:"日",agenda:"日程",date:"日期",time:"时间",event:"活动",allDay:"全天 / 截止",noEventsInRange:"本时段暂无活动",showMore:n => `另 ${n} 项`}}
        style={{height:700}}
      />}</div>
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
        {taskItems.length === 0 ? <p className="side-empty">本周暂无任务</p> : taskItems.slice(0, 4).map(t => <Link className="side-task" key={t.id} to={`/app/teams/${id}/tasks?task=${t.id}`} state={{ fromCalendar: location.pathname }}><span className={`side-status ${t.status}${t.overdue ? " overdue" : ""}`} aria-hidden="true" /><span><strong>{t.title}</strong><small>{formatTime(t.due_at, zone)}</small></span></Link>)}
      </section>

      <section className="side-card">
        <div className="side-card-head"><h3>本周成员忙闲</h3><span className="side-count">{members.data?.items.length ?? 0} 人</span></div>
        {busy ? (availability.isPending ? <p className="side-empty">忙闲加载中…</p> : (availability.data?.members || []).map(m => <div className="busy-row" key={m.user_id}><span>{m.display_name}</span><span className="busy-track"><span style={{width:`${Math.min(100, m.blocks.length * 22)}%`}} /></span><small>{m.blocks.length ? `${m.blocks.length} 段` : "空闲"}</small></div>)) : <p className="side-empty">勾选“显示周忙闲”查看</p>}
      </section>
    </aside>

    {initial && <EventEditor teamId={id} timezone={zone} members={members.data?.items || []} initial={initial} onClose={() => setInitial(null)} />}
  </section>;
}
