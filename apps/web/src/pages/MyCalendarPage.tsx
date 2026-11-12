import { useQuery } from "@tanstack/react-query";
import {
  createPersonalEvent,
  deletePersonalEvent,
  formatTime,
  listMyTeamEvents,
  listPersonalEvents,
  localInput,
  shiftDate,
  toUtc,
  updatePersonalEvent,
  type MyTeamEvent,
  type PersonalEvent,
} from "@teamsync/shared";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useEscapeKey } from "../hooks/useEscapeKey";
import { useAction } from "../hooks/useWork";
import { textColorFor } from "../lib/calendarColors";
import { friendlyMessage } from "../lib/errors";

const shareColor = "#7c3aed";

function isoDay(date: string): string {
  return `${date}T00:00:00Z`;
}

export default function MyCalendarPage() {
  const zone = "Asia/Shanghai";
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [defaultStart] = useState(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 3600000);
    return { start: start.toISOString(), end: end.toISOString() };
  });
  const [editing, setEditing] = useState<PersonalEvent | "new" | null>(null);
  const action = useAction();
  useEscapeKey(Boolean(editing) && !action.pending, () => setEditing(null));

  const from = isoDay(shiftDate(date, -7));
  const to = isoDay(shiftDate(date, 30));
  const query = useQuery({
    queryKey: ["personal", from, to],
    queryFn: () => listPersonalEvents(from, to),
  });
  // CR-011：团队里“我要参加/待回应”的活动以只读方式并入个人日历，不复制数据。
  const teamFeed = useQuery({
    queryKey: ["personal-team-events", from, to],
    queryFn: () => listMyTeamEvents(from, to),
  });

  const teamByDay = useMemo(() => {
    const map = new Map<string, MyTeamEvent[]>();
    for (const item of [...(teamFeed.data?.attending ?? []), ...(teamFeed.data?.invites ?? [])]) {
      map.set(item.local_date, [...(map.get(item.local_date) ?? []), item]);
    }
    return map;
  }, [teamFeed.data]);

  const personalByDay = useMemo(() => {
    const map = new Map<string, PersonalEvent[]>();
    for (const item of query.data?.items ?? []) {
      const day = localInput(item.start_at, zone).slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return map;
  }, [query.data, zone]);

  const days = useMemo(() => {
    const all = [...personalByDay.keys(), ...teamByDay.keys()].sort();
    return all.map((day) => ({
      day,
      personal: personalByDay.get(day) ?? [],
      team: teamByDay.get(day) ?? [],
    }));
  }, [personalByDay, teamByDay]);

  const edit = editing && editing !== "new" ? editing : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="panel my-calendar-page">
      <div className="page-head compact">
        <div>
          <p className="eyebrow">个人空间</p>
          <h1>我的日程</h1>
          <p className="muted">
            这里汇总「我参加的团队活动」与「我的个人安排」；团队活动来自各团队，个人事件只属于你、默认以“忙碌”参与团队忙闲。
          </p>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDate(shiftDate(date, -7))}
          >
            上一周
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setDate(today)}>
            今天
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDate(shiftDate(date, 7))}
          >
            下一周
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            新建个人事件
          </button>
        </div>
      </div>

      {query.isError && <p role="alert">{friendlyMessage(query.error)}</p>}
      {teamFeed.isError && <p role="alert">{friendlyMessage(teamFeed.error)}</p>}
      {query.isPending && <p>我的日程加载中…</p>}
      {query.data?.total === 0 && (teamFeed.data?.attending.length ?? 0) === 0 && (teamFeed.data?.invites.length ?? 0) === 0 && (
        <div className="empty-state">
          <h2>还没有个人事件</h2>
          <p className="muted">面试、通勤、兼职、考试……都可以放在这里，不影响团队日历。</p>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            新建第一条
          </button>
        </div>
      )}

      {days.map(({ day, personal: items, team }) => (
        <article className="work-row personal-day" key={day}>
          <div>
            <strong>{day}</strong>
            <p className="muted">
              {items.length === 0
                ? `${team.length} 项团队活动`
                : team.length === 0
                  ? `${items.length} 项个人安排`
                  : `${items.length} 项个人 · ${team.length} 项团队`}
            </p>
          </div>
          <ul className="personal-list">
            {team.map((item) => (
              <li key={`team-${item.id}`}>
                <span
                  className="personal-swatch personal-swatch-team"
                  style={{ backgroundColor: item.my_response === "pending" ? "#16a34a" : "#2563eb", color: "#ffffff" }}
                  aria-hidden="true"
                >
                  {item.my_response === "pending" ? "邀" : "会"}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.all_day ? "全天" : `${formatTime(item.start_at, zone)} – ${formatTime(item.end_at, zone).split(" ").at(-1)}`}
                    {item.location ? ` · ${item.location}` : ""}
                    {" · "}
                    {item.team_name}
                    {item.my_response === "pending" ? " · 待我回应" : item.needs_confirmation ? " · 待重新确认" : ""}
                  </small>
                </span>
                <span className="panel-actions">
                  <Link
                    className="btn btn-ghost btn-sm"
                    to={`/app/teams/${item.team_id}/events/${item.id}`}
                  >
                    查看活动
                  </Link>
                </span>
              </li>
            ))}
            {items.map((item) => (
              <li key={item.id}>
                <span
                  className="personal-swatch"
                  style={{ backgroundColor: item.share_busy ? shareColor : "#cbd5e1", color: textColorFor(item.share_busy ? shareColor : "#cbd5e1") }}
                  aria-hidden="true"
                >
                  {item.share_busy ? "忙" : "私"}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.all_day ? "全天" : `${formatTime(item.start_at, zone)} – ${formatTime(item.end_at, zone).split(" ").at(-1)}`}
                    {item.location ? ` · ${item.location}` : ""}
                    {" · "}
                    {item.share_busy ? "参与团队忙闲" : "不显示给团队"}
                  </small>
                </span>
                <span className="panel-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(item)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={action.pending}
                    onClick={() => {
                      if (window.confirm(`确定删除个人事件「${item.title}」？`)) {
                        void action
                          .run(async () => {
                            await deletePersonalEvent(item.id);
                            await query.refetch();
                          })
                          .catch(() => {});
                      }
                    }}
                  >
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}

      {editing && (
        <div className="modal-backdrop">
          <section className="work-dialog" role="dialog" aria-modal="true" aria-label={edit ? "编辑个人事件" : "新建个人事件"}>
            <h3>{edit ? "编辑个人事件" : "新建个人事件"}</h3>
            <form
              className="work-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const allDay = form.get("all_day") === "on";
                const startLocal = String(form.get("start"));
                const endLocal = String(form.get("end"));
                const start = allDay ? toUtc(`${startLocal}T00:00`, zone) : toUtc(startLocal, zone);
                const end = allDay ? toUtc(`${shiftDate(endLocal, 1)}T00:00`, zone) : toUtc(endLocal, zone);
                const data = {
                  title: String(form.get("title")),
                  description: String(form.get("description")) || null,
                  location: String(form.get("location")) || null,
                  start_at: start,
                  end_at: end,
                  all_day: allDay,
                  share_busy: form.get("share_busy") === "on",
                };
                void action
                  .run(async () => {
                    if (edit) await updatePersonalEvent(edit.id, data);
                    else await createPersonalEvent(data);
                    setEditing(null);
                    await query.refetch();
                  })
                  .catch(() => {});
              }}
            >
              <label>
                标题
                <input name="title" maxLength={100} defaultValue={edit?.title} required autoFocus />
              </label>
              <label>
                开始时间
                <input
                  name="start"
                  type="datetime-local"
                  defaultValue={localInput(edit?.start_at ?? defaultStart.start, zone)}
                  required
                />
              </label>
              <label>
                结束时间
                <input
                  name="end"
                  type="datetime-local"
                  defaultValue={localInput(edit?.end_at ?? defaultStart.end, zone)}
                  required
                />
              </label>
              <label className="checkbox-row">
                <input name="all_day" type="checkbox" defaultChecked={edit?.all_day} />
                全天（按你的时区 00:00 到次日 00:00）
              </label>
              <label>
                地点
                <input name="location" maxLength={200} defaultValue={edit?.location ?? ""} />
              </label>
              <label>
                描述
                <textarea name="description" maxLength={2000} defaultValue={edit?.description ?? ""} />
              </label>
              <label className="checkbox-row">
                <input name="share_busy" type="checkbox" defaultChecked={edit?.share_busy ?? true} />
                在团队忙闲中显示为“忙碌”（不显示标题）
              </label>
              <div className="panel-actions">
                <button className="btn btn-primary" disabled={action.pending}>
                  保存
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                  取消
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
