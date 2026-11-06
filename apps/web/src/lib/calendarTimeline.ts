// Coordinates are team wall-clock dates supplied by the shared date helpers.
export interface TimelineItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
}
interface Segment { start: number; end: number; top: number; height: number; folded: boolean; }
const DAY = 1440;
export const timeLabel = (minute: number) => minute === DAY ? "24:00" : `${String(Math.floor(minute / 60)).padStart(2,"0")}:${String(minute % 60).padStart(2,"0")}`;
export const minutes = (value: Date, day: string) => value.getTime() <= new Date(`${day}T00:00`).getTime() ? 0
  : value.getTime() >= new Date(`${day}T00:00`).setDate(new Date(`${day}T00:00`).getDate() + 1) ? DAY
  : value.getHours() * 60 + value.getMinutes();
export const intersects = (item: TimelineItem, day: string) => item.start < new Date(new Date(`${day}T00:00`).setDate(new Date(`${day}T00:00`).getDate() + 1)) && item.end > new Date(`${day}T00:00`);

export function buildSegments(step: number, occupied: {start:number;end:number}[], expanded: string[] = []): Segment[] {
  const slots = Array.from({length:DAY / step}, (_,i) => ({start:i * step,end:(i+1) * step}));
  const segments: Segment[] = [];
  let top = 0;
  for (let i = 0; i < slots.length;) {
    const slot = slots[i];
    const isEmpty = (s: typeof slot) => !occupied.some(item => item.start < s.end && item.end > s.start);
    let endIndex = i + 1;
    if (isEmpty(slot)) while (endIndex < slots.length && isEmpty(slots[endIndex])) endIndex++;
    const end = slots[endIndex - 1].end;
    const folded = isEmpty(slot) && end - slot.start >= Math.max(180, step * 2) && !expanded.some(range => { const [from,to] = range.split("-").map(Number); return slot.start < to && end > from; });
    if (folded) {
      segments.push({start:slot.start,end,top,height:38,folded:true}); top += 38; i = endIndex;
    } else {
      segments.push({...slot,top,height:56,folded:false}); top += 56; i++;
    }
  }
  return segments;
}
export function positionAt(segments: Segment[], minute: number) {
  const segment = segments.find(s => minute >= s.start && minute < s.end) || segments[segments.length - 1];
  return segment.top + Math.max(0,Math.min(1,(minute - segment.start)/(segment.end - segment.start))) * segment.height;
}
export function minuteAt(segments: Segment[], position: number) {
  const segment = segments.find(s => position < s.top + s.height) || segments[segments.length - 1];
  return segment.start + Math.max(0,Math.min(1,(position - segment.top)/segment.height)) * (segment.end - segment.start);
}
export function layoutEvents<T extends TimelineItem>(items: T[], day: string) {
  const sorted = items.filter(item => !item.allDay && intersects(item,day)).sort((a,b) => a.start.getTime()-b.start.getTime() || b.end.getTime()-a.end.getTime());
  const result: {item:T;lane:number;lanes:number}[] = [];
  let group: typeof result = []; let ends: number[] = []; let groupEnd = -Infinity;
  const flush = () => { group.forEach(entry => {entry.lanes = ends.length;}); group = []; ends = []; };
  for (const item of sorted) {
    if (item.start.getTime() >= groupEnd) { flush(); groupEnd = -Infinity; }
    let lane = ends.findIndex(end => end <= item.start.getTime());
    if (lane === -1) lane = ends.length;
    ends[lane] = item.end.getTime(); groupEnd = Math.max(groupEnd,item.end.getTime());
    const entry = {item,lane,lanes:1}; group.push(entry); result.push(entry);
  }
  flush(); return result;
}

