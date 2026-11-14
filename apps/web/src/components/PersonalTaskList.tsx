import { formatTime } from "@teamsync/shared";
import { Link } from "react-router-dom";

import { PERSONAL_COLORS, type AgendaTask, type PersonalUrgency } from "../lib/personalItems";

const URGENCY_LABEL: Record<PersonalUrgency, string> = {
  urgent: "紧急",
  pending: "待回应",
  normal: "正常",
  done: "已完成",
};

const BADGE: Record<PersonalUrgency, string> = { urgent: "急", pending: "待", normal: "任", done: "完" };

/** 个人日历“任务清单”视图：按截止日分组，颜色与日历同源（红=紧急、绿=正常、灰=完成）。 */
export default function PersonalTaskList({
  groups,
  zone,
}: {
  groups: { day: string; tasks: { task: AgendaTask; urgency: PersonalUrgency }[] }[];
  zone: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <h2>暂无任务</h2>
        <p className="muted">指派给你、逾期或 30 天内到期的任务会出现在这里。</p>
      </div>
    );
  }
  return (
    <div className="personal-task-list">
      {groups.map(({ day, tasks }) => (
        <article className="work-row personal-day" key={day}>
          <div>
            <strong>{day}</strong>
            <p className="muted">{tasks.length} 项任务</p>
          </div>
          <ul className="personal-list">
            {tasks.map(({ task, urgency }) => (
              <li
                key={task.id}
                className={`personal-row personal-row-${urgency}`}
                style={{
                  backgroundColor: `color-mix(in srgb, ${PERSONAL_COLORS[urgency]} 12%, white)`,
                  borderLeft: `3px solid ${PERSONAL_COLORS[urgency]}`,
                }}
              >
                <span
                  className="personal-swatch"
                  style={{ backgroundColor: PERSONAL_COLORS[urgency], color: "#ffffff" }}
                  aria-hidden="true"
                >
                  {BADGE[urgency]}
                </span>
                <span>
                  <strong>{task.title}</strong>
                  <small>
                    截止 {formatTime(task.due_at, zone)} · {task.team_name}
                    {task.overdue ? " · 已逾期" : urgency === "urgent" ? " · 24 小时内到期" : ""}
                    {" · "}
                    {URGENCY_LABEL[urgency]}
                  </small>
                </span>
                <span className="panel-actions">
                  <Link
                    className="btn btn-ghost btn-sm"
                    to={`/app/teams/${task.team_id}/tasks?task=${task.id}`}
                  >
                    查看任务
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
