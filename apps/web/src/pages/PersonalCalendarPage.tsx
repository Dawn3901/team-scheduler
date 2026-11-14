import { useQuery } from "@tanstack/react-query";
import { calendarUtc, dateRange, listAgenda, localInput, shiftDate, toUtc } from "@teamsync/shared";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";

import CalendarTimeline from "../components/CalendarTimeline";
import CalendarViewSwitcher from "../components/CalendarViewSwitcher";
import PersonalEventDialog from "../components/PersonalEventDialog";
import PersonalTaskList from "../components/PersonalTaskList";
import { friendlyMessage } from "../lib/errors";
import {
  groupTasksByDay,
  PERSONAL_COLORS,
  toPersonalItems,
  type PersonalItem,
} from "../lib/personalItems";
import type { PersonalEvent } from "@teamsync/shared";
import type { CSSProperties } from "react";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales: { "zh-CN": zhCN },
});

type PersonalView = "month" | "week" | "tasks";

const VIEW_OPTIONS: { value: PersonalView; label: string }[] = [
  { value: "month", label: "月" },
  { value: "week", label: "周" },
  { value: "tasks", label: "任务清单" },
];

const STORAGE_KEY = "teamsync.my-calendar.ui";

interface StoredState {
  view: PersonalView;
  date: string;
}

function readState(): Partial<StoredState> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export default function PersonalCalendarPage() {
  const saved = useMemo(() => readState(), []);
  const zone = "Asia/Shanghai";
  const [view, setView] = useState<PersonalView>(() =>
    saved?.view === "month" || saved?.view === "tasks" ? saved.view : "week",
  );
  const [date, setDate] = useState(() => saved?.date ?? localInput(new Date().toISOString(), zone).slice(0, 10));
  const [editing, setEditing] = useState<PersonalEvent | "new" | null>(null);
  const [newStart, setNewStart] = useState<string | undefined>();

  const days = dateRange(date, view === "month" ? "month" : "week");
  const from = toUtc(`${days[0]}T00:00`, zone);
  const to = toUtc(`${shiftDate(days[days.length - 1], 1)}T00:00`, zone);
  const agenda = useQuery({
    queryKey: ["agenda", from, to],
    queryFn: () => listAgenda(from, to),
  });

  const remember = (nextView: PersonalView, nextDate: string) => {
    setView(nextView);
    setDate(nextDate);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ view: nextView, date: nextDate }));
    } catch {
      /* storage 不可用时只影响记忆 */
    }
  };

  const items = useMemo(() => toPersonalItems(agenda.data), [agenda.data]);

  const withDates = useMemo(
    () =>
      items.map(item => ({
        ...item,
        startDate: new Date(item.start),
        endDate: item.kind === "task" ? new Date(new Date(item.start).getTime() + 86400000) : new Date(item.end),
        allDay: item.allDay || item.kind === "task",
      })),
    [items],
  );

  const timelineItems = useMemo(
    () =>
      withDates.map(item => ({
        id: item.id,
        title: item.title,
        label: item.title,
        start: item.startDate,
        end: item.endDate,
        allDay: item.allDay,
        color: PERSONAL_COLORS[item.urgency],
        item,
      })),
    [withDates],
  );

  const taskGroups = useMemo(
    () => groupTasksByDay(agenda.data, iso => localInput(iso, zone).slice(0, 10)),
    [agenda.data, zone],
  );

  const shift = (delta: number) => {
    const base = view === "month" ? date : days[0];
    remember(view, shiftDate(base, delta * (view === "month" ? 28 : 7)));
  };

  const goToday = () => remember(view, localInput(new Date().toISOString(), zone).slice(0, 10));

  const onSelect = (item: PersonalItem) => {
    if (item.kind === "task" && item.task) {
      window.location.assign(`/app/teams/${item.task.team_id}/tasks?task=${item.task.id}`);
      return;
    }
    if (item.event?.kind === "team_event" && item.event.team_id) {
      window.location.assign(`/app/teams/${item.event.team_id}/events/${item.event.source_id}`);
      return;
    }
    if (item.event?.kind === "personal") {
      const original = agenda.data?.events.find(e => e.id === item.event!.id);
      if (original) {
        setEditing({
          id: original.source_id,
          title: original.title,
          description: null,
          start_at: original.start_at,
          end_at: original.end_at,
          all_day: original.all_day,
          location: original.location,
          color: null,
          share_busy: true,
          updated_at: original.start_at,
        });
      }
    }
  };

  const legend = (
    <p className="personal-calendar-legend" aria-label="颜色说明">
      <span style={{ "--legend": PERSONAL_COLORS.urgent } as CSSProperties}>红：紧急（2 小时内 / 逾期）</span>
      <span style={{ "--legend": PERSONAL_COLORS.pending } as CSSProperties}>蓝：活动待回应</span>
      <span style={{ "--legend": PERSONAL_COLORS.normal } as CSSProperties}>绿：正常</span>
    </p>
  );

  return (
    <section className="panel personal-calendar-page">
      <div className="page-head compact">
        <div>
          <p className="eyebrow">个人空间</p>
          <h1>我的日程</h1>
          <p className="muted">
            这里只有「我的」内容：个人日程、我参加或待回应的团队活动、指派给我的任务。
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditing("new")}>
            新建个人事件
          </button>
        </div>
      </div>

      <div className="calendar-filterbar">
        <button type="button" className="icon-btn" aria-label="上一页" onClick={() => shift(-1)}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={goToday}>
          今天
        </button>
        <button type="button" className="icon-btn" aria-label="下一页" onClick={() => shift(1)}>
          <span aria-hidden="true">›</span>
        </button>
        <CalendarViewSwitcher value={view} options={VIEW_OPTIONS} onChange={next => remember(next, date)} />
        {legend}
      </div>

      {agenda.isError ? (
        <p role="alert" className="calendar-error">
          {friendlyMessage(agenda.error)}{" "}
          <button className="btn btn-sm btn-secondary" onClick={() => void agenda.refetch()}>
            重试
          </button>
        </p>
      ) : null}
      {agenda.isPending ? <p>我的日程加载中…</p> : null}

      {view === "tasks" ? (
        <PersonalTaskList groups={taskGroups} zone={zone} />
      ) : agenda.data && items.length === 0 ? (
        <div className="empty-state">
          <h2>这段时间没有安排</h2>
          <p className="muted">新建个人事件，或去团队日历参加活动。</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            新建第一条
          </button>
        </div>
      ) : view === "month" ? (
        <div className="calendar-scroll view-month">
          <Calendar
            localizer={localizer}
            culture="zh-CN"
            date={new Date(`${date}T12:00`)}
            view="month"
            views={["month"]}
            events={withDates.map(item => ({ ...item, start: item.startDate, end: item.endDate, color: PERSONAL_COLORS[item.urgency] }))}
            startAccessor="start"
            endAccessor="end"
            selectable
            onNavigate={d => remember("month", format(d, "yyyy-MM-dd"))}
            onView={() => undefined}
            onSelectSlot={slot => {
              setNewStart(calendarUtc(slot.start, zone));
              setEditing("new");
            }}
            onSelectEvent={event => onSelect((event as unknown as { item: PersonalItem }).item ?? (event as unknown as PersonalItem))}
            eventPropGetter={event => {
              const color = (event as unknown as { color: string }).color;
              return {
                style: {
                  backgroundColor: `color-mix(in srgb, ${color} 12%, white)`,
                  borderColor: `color-mix(in srgb, ${color} 35%, white)`,
                  borderLeft: `3px solid ${color}`,
                  color: "#111827",
                },
              };
            }}
            messages={{
              today: "今天",
              previous: "上一页",
              next: "下一页",
              month: "月",
              date: "日期",
              event: "安排",
              allDay: "全天",
              noEventsInRange: "这个月没有安排",
              showMore: n => `另 ${n} 项`,
            }}
            style={{ height: 700 }}
          />
        </div>
      ) : (
        <div className="calendar-scroll view-week">
          <CalendarTimeline
            days={days}
            items={timelineItems as unknown as (PersonalItem & { start: Date; end: Date; allDay: boolean; color: string })[]}
            today={localInput(new Date().toISOString(), zone).slice(0, 10)}
            onSelect={item => onSelect((item as unknown as { item: PersonalItem }).item)}
            onCreate={start => {
              setNewStart(calendarUtc(start, zone));
              setEditing("new");
            }}
            storageKey="personal"
          />
        </div>
      )}

      {editing ? (
        <PersonalEventDialog
          zone={zone}
          event={editing === "new" ? null : editing}
          initialStart={newStart}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await agenda.refetch();
          }}
        />
      ) : null}
    </section>
  );
}
