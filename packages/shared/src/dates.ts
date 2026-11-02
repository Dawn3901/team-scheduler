/** 所有 UI 时间转换集中在共享层；团队时区支持 DST，避免手加八小时。 */
export function localInput(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function toUtc(local: string, timezone: string): string {
  const desired = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(desired)) throw new Error("请输入有效时间");
  let candidate = desired;
  for (let i = 0; i < 4; i++) {
    const actual = Date.parse(`${localInput(new Date(candidate).toISOString(), timezone)}:00Z`);
    candidate += desired - actual;
  }
  const iso = new Date(candidate).toISOString();
  if (localInput(iso, timezone) !== local) throw new Error("该时间在团队时区不存在，请调整时间");
  return iso;
}
export const formatTime = (iso: string, timezone: string) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: timezone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(iso));
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dateRange(date: string, view: "month" | "week" | "day") {
  let start = date;
  let days = 1;
  if (view === "month") {
    start = `${date.slice(0, 7)}-01`;
    start = shiftDate(start, -(new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7);
    days = 42;
  } else if (view === "week") {
    start = shiftDate(date, -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7); days = 7;
  }
  return Array.from({length: days}, (_, i) => shiftDate(start, i));
}
/** 日历库使用宿主 Date；边界处映射为团队墙上时间，API 仍使用真实 UTC。 */
export function calendarDate(iso: string, timezone: string): Date {
  return new Date(localInput(iso, timezone));
}
export function calendarUtc(date: Date, timezone: string): string {
  const pad = (n: number) => String(n).padStart(2,"0");
  return toUtc(`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,timezone);
}
