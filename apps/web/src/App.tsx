import { useEffect, useState } from "react";
import { fetchHealth, type HealthStatus } from "@teamsync/shared";

type BackendState = "checking" | "ok" | "down";

const NEXT_STEPS = [
  "W1-04 数据库迁移与 users / teams / team_members 表",
  "W1-05 注册、登录、JWT 与统一鉴权依赖",
  "W1-06 团队创建、邀请码、成员列表",
  "W1-07 登录页、团队页与 AppShell",
];

export default function App() {
  const [backend, setBackend] = useState<BackendState>("checking");
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((result) => {
        if (cancelled) return;
        setHealth(result);
        setBackend("ok");
      })
      .catch(() => {
        if (!cancelled) setBackend("down");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const backendLabel =
    backend === "checking" ? "检查中…" : backend === "ok" ? "已连接" : "未连接";

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">TeamSync · 同频</p>
        <h1>团队共享日程</h1>
        <p className="lede">
          仓库骨架已建立：Web、FastAPI、共享 API Client 与 Alembic 迁移可运行。
        </p>

        <div className={`status status-${backend}`}>
          <span className="dot" aria-hidden="true" />
          <span>后端 {backendLabel}</span>
          {health ? <code>db: {health.db}</code> : null}
        </div>

        <h2>接下来</h2>
        <ol className="steps">
          {NEXT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        <p className="hint">
          启动：<code>make dev</code>（后端 8000 / 前端 5173）。契约以 docs/03 为准。
        </p>
      </section>
    </main>
  );
}
