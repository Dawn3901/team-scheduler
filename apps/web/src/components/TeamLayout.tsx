import { ApiError } from "@teamsync/shared";
import { Link, Outlet, useParams } from "react-router-dom";

import { useNativeNotifications } from "../hooks/useNativeNotifications";
import { useTeam } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";

export function TeamLayout() {
  const { teamId } = useParams();
  const numericTeamId = Number(teamId);
  const teamQuery = useTeam(numericTeamId);
  useNativeNotifications(numericTeamId, teamQuery.isSuccess);

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

  return (
    <div className="workspace">
      <Outlet />
    </div>
  );
}
