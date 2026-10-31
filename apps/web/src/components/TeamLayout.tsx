import { ApiError } from "@teamsync/shared";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";

import { useTeam } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";
import { InviteCode } from "./InviteCode";
import { RoleBadge } from "./RoleBadge";

export function TeamLayout() {
  const { teamId } = useParams();
  const numericTeamId = Number(teamId);
  const teamQuery = useTeam(numericTeamId);

  if (!Number.isInteger(numericTeamId) || numericTeamId <= 0) {
    return (
      <section className="panel error-panel">
        <h1>找不到这个团队</h1>
        <p className="muted">团队地址不正确，请回到团队选择页重试。</p>
        <Link className="btn btn-primary" to="/app">
          返回团队选择
        </Link>
      </section>
    );
  }

  if (teamQuery.isPending) {
    return (
      <div className="workspace-skeleton" aria-label="团队加载中">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-block" />
      </div>
    );
  }

  if (teamQuery.isError) {
    const notFound = teamQuery.error instanceof ApiError && teamQuery.error.status === 404;

    return (
      <section className="panel error-panel">
        <h1>{notFound ? "找不到这个团队" : "团队加载失败"}</h1>
        <p className="muted">
          {notFound
            ? "团队不存在，或你还不是该团队成员。"
            : friendlyMessage(teamQuery.error)}
        </p>
        <div className="panel-actions">
          <Link className="btn btn-secondary" to="/app">
            返回团队选择
          </Link>
          {notFound ? null : (
            <button type="button" className="btn btn-primary" onClick={() => teamQuery.refetch()}>
              重试
            </button>
          )}
        </div>
      </section>
    );
  }

  const team = teamQuery.data;

  return (
    <section className="workspace">
      <header className="workspace-head">
        <div className="workspace-title">
          <p className="eyebrow">团队空间 · {team.member_count} 位成员</p>
          <div className="workspace-name">
            <h1>{team.name}</h1>
            <RoleBadge role={team.my_role} />
          </div>
          <p className="muted">{team.description ?? "暂无团队描述"}</p>
        </div>
        <InviteCode code={team.invite_code} />
      </header>

      <nav className="workspace-nav" aria-label="团队导航">
        <NavLink to="calendar">日历</NavLink>
        <NavLink to="tasks">任务</NavLink>
        <NavLink to="members">成员</NavLink>
        <NavLink to="settings">设置</NavLink>
      </nav>

      <div className="workspace-body">
        <Outlet />
      </div>
    </section>
  );
}
