import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { buildSegments, positionAt, minuteAt, minutes, intersects, timeLabel, layoutEvents, type TimelineItem } from "../lib/calendarTimeline";
import { borderColorFor } from "../lib/calendarColors";

export interface TimelineColumn { id:string; day:string; resourceId?:number; header:ReactNode; }

const LEVELS = [120, 60, 30, 15] as const;
// 时间轴背景是 event color 的 10% 浅色，统一用深色文字，避免白字看不清。
const TIMELINE_TEXT_COLOR = "#111827";

export default function CalendarTimeline<T extends TimelineItem>({days,items,backgroundItems = [],today,columns,onSelect,onCreate,storageKey}: {
  days:string[]; items:T[]; backgroundItems?:TimelineItem[]; today:string; columns?:TimelineColumn[]; onSelect:(item:T) => void; onCreate:(date:Date) => void; storageKey?:string;
}) {
  const storage = storageKey ? `teamsync.calendar.timeline.${storageKey}` : null;
  const [level,setLevel] = useState(() => {
    if (!storage) return 1;
    try {
      const raw = sessionStorage.getItem(`${storage}.level`);
      if (raw === null) return 1;
      const saved = Number(raw);
      return Number.isInteger(saved) && saved >= 0 && saved < LEVELS.length ? saved : 1;
    } catch { return 1; }
  });
  const [expanded,setExpanded] = useState<string[]>(() => {
    if (!storage) return [];
    try {
      const saved = JSON.parse(sessionStorage.getItem(`${storage}.expanded`) ?? "[]") as unknown;
      return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
    } catch { return []; }
  });
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef<{minute:number;offset:number} | null>(null);
  const wheelTotal = useRef(0);
  const step = LEVELS[level];
  useEffect(() => {
    if (!storage) return;
    try { sessionStorage.setItem(`${storage}.level`, String(level)); } catch { /* ignore */ }
  }, [level,storage]);
  useEffect(() => {
    if (!storage) return;
    try { sessionStorage.setItem(`${storage}.expanded`, JSON.stringify(expanded)); } catch { /* ignore */ }
  }, [expanded,storage]);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !storage) return;
    try {
      const saved = Number(sessionStorage.getItem(`${storage}.scroll`));
      if (Number.isFinite(saved) && saved > 0) element.scrollTop = saved;
    } catch { /* ignore */ }
    const onScroll = () => {
      try { sessionStorage.setItem(`${storage}.scroll`, String(element.scrollTop)); } catch { /* ignore */ }
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [storage]);
  const occupied = useMemo(() => {
    const timed = [...items.filter(item => !item.allDay),...backgroundItems];
    const ranges = days.flatMap(day => timed.filter(item => intersects(item,day)).map(item => ({start:minutes(item.start,day),end:minutes(item.end,day)})));
    // An empty calendar opens a useful daytime window; other hours stay folded.
    return ranges.length ? ranges : [{start:8*60,end:18*60}];
  },[days,items,backgroundItems]);
  const segments = useMemo(() => buildSegments(step,occupied,expanded),[step,occupied,expanded]);
  const height = segments.at(-1)!.top + segments.at(-1)!.height;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      wheelTotal.current += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (Math.abs(wheelTotal.current) < 70) return;
      const next = Math.max(0,Math.min(LEVELS.length-1,level + (wheelTotal.current < 0 ? 1 : -1)));
      wheelTotal.current = 0;
      if (next === level) return;
      const offset = Math.max(0,event.clientY-element.getBoundingClientRect().top);
      anchor.current = {minute:minuteAt(segments,element.scrollTop+offset),offset};
      setLevel(next);
    };
    element.addEventListener("wheel",onWheel,{passive:false});
    return () => element.removeEventListener("wheel",onWheel);
  },[level,segments]);
  useLayoutEffect(() => {
    if (anchor.current && viewport.current) {
      viewport.current.scrollTop = positionAt(segments,anchor.current.minute)-anchor.current.offset;
      anchor.current = null;
    }
  },[segments]);
  const changeLevel = (next:number) => {
    if (viewport.current) anchor.current = {minute:minuteAt(segments,viewport.current.scrollTop+viewport.current.clientHeight/2),offset:viewport.current.clientHeight/2};
    setLevel(next);
  };
  const displayColumns = columns ?? days.map(day => ({id:day,day,resourceId:undefined,header:<><span>{format(new Date(`${day}T12:00`),"EEEEE",{locale:zhCN})}</span><strong>{Number(day.slice(-2))}</strong>{day === today && <span className="today-pin" title="今天" aria-label="今天">📌</span>}</>}));
  const columnItems = (items: TimelineItem[], column: typeof displayColumns[number]) => items.filter(item => column.resourceId === undefined || item.resourceId === column.resourceId);
  const columnStyle = {"--timeline-days":displayColumns.length} as CSSProperties;
  return <div className="timeline" style={columnStyle}>
    <div className="timeline-controls">
      <span>滚轮向上放大 · 向下缩小 <span className="muted">/ 空闲时段自动折叠</span></span>
      <div role="group" aria-label="时间粒度"><button type="button" aria-label="缩小时间轴" disabled={level === 0} onClick={() => changeLevel(level-1)}>−</button><output aria-live="polite">{step >= 60 ? `${step/60} 小时` : `${step} 分钟`}</output><button type="button" aria-label="放大时间轴" disabled={level === LEVELS.length-1} onClick={() => changeLevel(level+1)}>＋</button></div>
    </div>
    <div className="timeline-horizontal">
      <div className="timeline-sheet">
        <div className="timeline-head"><span className="timeline-corner">时间</span>{displayColumns.map(column => <div key={column.id} className={column.day === today ? "is-today" : ""}>{column.header}</div>)}</div>
        <div className="timeline-allday"><span>全天 / 截止</span>{displayColumns.map(column => <div key={column.id}>{items.filter(item => item.allDay && intersects(item,column.day) && (column.resourceId === undefined || item.resourceId === column.resourceId)).map(item => <button type="button" key={item.id} style={{"--event-color":item.color, "--event-text":TIMELINE_TEXT_COLOR, "--event-border":borderColorFor(item.color)} as CSSProperties} onClick={() => onSelect(item)} title={item.title}>{item.title}</button>)}</div>)}</div>
        <div className="timeline-viewport" ref={viewport} tabIndex={0} aria-label="可缩放时间轴，使用滚轮调整粒度，方向键滚动">
          <div className="timeline-body" style={{height}}>
            {segments.map(segment => segment.folded ? <button type="button" className="timeline-fold" key={segment.start} style={{top:segment.top,height:segment.height}} onClick={() => setExpanded(current => [...current,`${segment.start}-${segment.end}`])}><span>{timeLabel(segment.start)} — {timeLabel(segment.end)}</span><span>··· 空闲 {((segment.end-segment.start)/60).toLocaleString("zh-CN")} 小时 · 点击展开</span></button> :
              <div className="timeline-row" key={segment.start} style={{top:segment.top,height:segment.height}}><span>{timeLabel(segment.start)}</span>{displayColumns.map(column => <button type="button" key={column.id} aria-label={`${column.day} ${timeLabel(segment.start)} 新建活动`} onClick={() => onCreate(new Date(`${column.day}T${timeLabel(segment.start)}`))} />)}</div>)}
            <div className="timeline-event-columns">{displayColumns.map(column => { const day = column.day; return <div className="timeline-event-column" key={column.id}>
              {columnItems(backgroundItems,column).filter(item => intersects(item,day)).map(item => <div className="timeline-busy-block" key={item.id} title={item.title} style={{top:positionAt(segments,minutes(item.start,day)),height:positionAt(segments,minutes(item.end,day))-positionAt(segments,minutes(item.start,day))}} />)}
              {layoutEvents(items.filter(item => column.resourceId === undefined || item.resourceId === column.resourceId),day).map(({item,lane,lanes}) => {
                const top = positionAt(segments,minutes(item.start,day));
                return <button type="button" className="timeline-event" key={item.id} title={`${item.title} · ${format(item.start,"HH:mm")} – ${format(item.end,"HH:mm")}`} onClick={() => onSelect(item)} style={{"--event-color":item.color, "--event-text":TIMELINE_TEXT_COLOR, "--event-border":borderColorFor(item.color),top,height:Math.max(22,positionAt(segments,minutes(item.end,day))-top-3),left:`${lane/lanes*100}%`,width:`calc(${100/lanes}% - 5px)`} as CSSProperties}><small>{format(item.start,"HH:mm")} – {format(item.end,"HH:mm")}</small><strong>{item.label ?? item.title}</strong></button>;
              })}
            </div>; })}</div>
          </div>
        </div>
      </div>
    </div>
    {!!expanded.length && <button type="button" className="timeline-reset" onClick={() => setExpanded([])}>重新折叠空闲时段</button>}
  </div>;
}
