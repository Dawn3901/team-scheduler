import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { buildSegments, positionAt, minuteAt, minutes, intersects, timeLabel, layoutEvents, type TimelineItem } from "../lib/calendarTimeline";

const LEVELS = [120, 60, 30, 15] as const;

export default function CalendarTimeline<T extends TimelineItem>({days,items,backgroundItems = [],today,onSelect,onCreate}: {
  days:string[]; items:T[]; backgroundItems?:TimelineItem[]; today:string; onSelect:(item:T) => void; onCreate:(date:Date) => void;
}) {
  const [level,setLevel] = useState(1);
  const [expanded,setExpanded] = useState<string[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef<{minute:number;offset:number} | null>(null);
  const wheelTotal = useRef(0);
  const step = LEVELS[level];
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
  const columns = {"--timeline-days":days.length} as CSSProperties;
  return <div className="timeline" style={columns}>
    <div className="timeline-controls">
      <span>滚轮向上放大 · 向下缩小 <span className="muted">/ 空闲时段自动折叠</span></span>
      <div role="group" aria-label="时间粒度"><button type="button" aria-label="缩小时间轴" disabled={level === 0} onClick={() => changeLevel(level-1)}>−</button><output aria-live="polite">{step >= 60 ? `${step/60} 小时` : `${step} 分钟`}</output><button type="button" aria-label="放大时间轴" disabled={level === LEVELS.length-1} onClick={() => changeLevel(level+1)}>＋</button></div>
    </div>
    <div className="timeline-horizontal">
      <div className="timeline-sheet">
        <div className="timeline-head"><span className="timeline-corner">时间</span>{days.map(day => <div key={day} className={day === today ? "is-today" : ""}><span>{format(new Date(`${day}T12:00`),"EEEE",{locale:zhCN})}</span><strong>{day.slice(-2)}</strong></div>)}</div>
        <div className="timeline-allday"><span>全天 / 截止</span>{days.map(day => <div key={day}>{items.filter(item => item.allDay && intersects(item,day)).map(item => <button type="button" key={item.id} style={{"--event-color":item.color} as CSSProperties} onClick={() => onSelect(item)} title={item.title}>{item.title}</button>)}</div>)}</div>
        <div className="timeline-viewport" ref={viewport} tabIndex={0} aria-label="可缩放时间轴，使用滚轮调整粒度，方向键滚动">
          <div className="timeline-body" style={{height}}>
            {segments.map(segment => segment.folded ? <button type="button" className="timeline-fold" key={segment.start} style={{top:segment.top,height:segment.height}} onClick={() => setExpanded(current => [...current,`${segment.start}-${segment.end}`])}><span>{timeLabel(segment.start)} — {timeLabel(segment.end)}</span><span>··· 空闲 {((segment.end-segment.start)/60).toLocaleString("zh-CN")} 小时 · 点击展开</span></button> :
              <div className="timeline-row" key={segment.start} style={{top:segment.top,height:segment.height}}><span>{timeLabel(segment.start)}</span>{days.map(day => <button type="button" key={day} className={day === today ? "is-today" : ""} aria-label={`${day} ${timeLabel(segment.start)} 新建活动`} onClick={() => onCreate(new Date(`${day}T${timeLabel(segment.start)}`))} />)}</div>)}
            <div className="timeline-event-columns">{days.map(day => <div className="timeline-event-column" key={day}>
              {backgroundItems.filter(item => intersects(item,day)).map(item => <div className="timeline-busy-block" key={item.id} title={item.title} style={{top:positionAt(segments,minutes(item.start,day)),height:positionAt(segments,minutes(item.end,day))-positionAt(segments,minutes(item.start,day))}} />)}
              {layoutEvents(items,day).map(({item,lane,lanes}) => {
                const top = positionAt(segments,minutes(item.start,day));
                return <button type="button" className="timeline-event" key={item.id} title={`${item.title} · ${format(item.start,"HH:mm")} – ${format(item.end,"HH:mm")}`} onClick={() => onSelect(item)} style={{"--event-color":item.color,top,height:Math.max(22,positionAt(segments,minutes(item.end,day))-top-3),left:`${lane/lanes*100}%`,width:`calc(${100/lanes}% - 5px)`} as CSSProperties}><small>{format(item.start,"HH:mm")} – {format(item.end,"HH:mm")}</small><strong>{item.title}</strong></button>;
              })}
            </div>)}</div>
          </div>
        </div>
      </div>
    </div>
    {!!expanded.length && <button type="button" className="timeline-reset" onClick={() => setExpanded([])}>重新折叠空闲时段</button>}
  </div>;
}
