import type { TeamSummary } from "@teamsync/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { CreateTeamForm } from "../components/CreateTeamForm";
import { JoinTeamForm } from "../components/JoinTeamForm";
import { TeamCard } from "../components/TeamCard";
import { useTeams } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";

type PanelMode = "create" | "join" | null;

export default function TeamSelectPage() {
  const teamsQuery = useTeams();
  const [mode, setMode] = useState<PanelMode>(null);
  const navigate = useNavigate();

  const goToTeam = (team: TeamSummary) => {
    navigate(`/app/teams/${team.id}/calendar`);
  };

  const teams = teamsQuery.data?.items ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">TeamSync · 同频</p>
          <h1>我的团队</h1>
          <p className="muted">选择一个团队开始，或创建 / 加入新的团队。</p>
        </div>
        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            aria-expanded={mode === "join"}
            onClick={() => setMode(mode === "join" ? null : "join")}
          >
            用邀请码加入
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={mode === "create"}
            onClick={() => setMode(mode === "create" ? null : "create")}
          >
            创建团队
          </button>
        </div>
      </div>

      {mode === "create" ? (
        <CreateTeamForm onCancel={() => setMode(null)} onCreated={goToTeam} />
      ) : null}

      {mode === "join" ? (
        <JoinTeamForm onCancel={() => setMode(null)} onJoined={goToTeam} />
      ) : null}

      <section aria-labelledby="team-list-heading" className="team-list-section">
        <h2 id="team-list-heading" className="sr-only">
          团队列表
        </h2>

        {teamsQuery.isPending ? (
          <>
            <p className="sr-only" role="status">
              正在加载团队…
            </p>
            <div className="team-grid" aria-hidden="true">
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          </>
        ) : null}

        {teamsQuery.isError ? (
          <section className="panel error-panel">
            <h2>团队列表加载失败</h2>
            <p className="muted">{friendlyMessage(teamsQuery.error)}</p>
            <div className="panel-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void teamsQuery.refetch()}
              >
                重试
              </button>
            </div>
          </section>
        ) : null}

        {teamsQuery.isSuccess && teams.length === 0 ? (
          <div className="empty-state">
            <h2>还没有加入任何团队</h2>
            <p className="muted">创建一个团队，或用邀请码加入同学的团队。</p>
            <div className="empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => setMode("create")}>
                创建第一个团队
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setMode("join")}>
                输入邀请码
              </button>
            </div>
          </div>
        ) : null}

        {teams.length > 0 ? (
          <div className="team-grid">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
