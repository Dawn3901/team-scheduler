import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@teamsync/shared";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Icon, type IconName } from "./Icon";
import LiveStatus from "./LiveStatus";
import { useMe, useTeam } from "../hooks/useSession";

const pageLabels: Record<string, string> = {
  calendar: "团队日历",
  tasks: "任务看板",
  members: "团队成员",
  settings: "团队设置",
  notifications: "通知中心",
  profile: "个人资料",
  tutorial: "新手教程",
  about: "关于",
  me: "我的日程",
};

function pageLabel(pathname: string): string {
  if (/\/events\/\d+/.test(pathname)) return "活动详情";
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return pageLabels[segment] ?? "我的团队";
}

export function AppShell() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const match = location.pathname.match(/^\/app\/teams\/(\d+)/);
  const teamId = match ? Number(match[1]) : 0;
  const team = useTeam(teamId).data;
  const label = pageLabel(location.pathname);
  const initial = me.data ? (Array.from(me.data.display_name)[0] ?? "?") : "?";

  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  const navItems: Array<{ to: string; label: string; icon: IconName; end?: boolean }> = teamId
    ? [
        { to: `/app/teams/${teamId}/calendar`, label: "团队日历", icon: "calendar" },
        { to: `/app/teams/${teamId}/tasks`, label: "任务看板", icon: "tasks" },
        { to: `/app/teams/${teamId}/members`, label: "团队成员", icon: "users" },
        { to: `/app/teams/${teamId}/settings`, label: "团队设置", icon: "settings" },
        { to: "/app/notifications", label: "通知中心", icon: "bell" },
        { to: "/app/profile", label: "个人资料", icon: "user" },
        { to: "/app/me/calendar", label: "我的日程", icon: "user" },
        { to: "/app/tutorial", label: "新手教程", icon: "help" },
        { to: "/app/about", label: "关于", icon: "info" },
      ]
    : [
        { to: "/app", label: "我的团队", icon: "users", end: true },
        { to: "/app/notifications", label: "通知中心", icon: "bell" },
        { to: "/app/me/calendar", label: "我的日程", icon: "calendar" },
        { to: "/app/profile", label: "个人资料", icon: "user" },
        { to: "/app/tutorial", label: "新手教程", icon: "help" },
        { to: "/app/about", label: "关于", icon: "info" },
      ];

  return (
    <div className="app-shell">
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="关闭菜单"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className={`app-sidebar${sidebarOpen ? " open" : ""}`} aria-label="主导航">
        <Link to="/app" className="sidebar-brand" onClick={closeSidebar}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-text">
            <strong>同频</strong>
            <small>TeamSync</small>
          </span>
        </Link>

        <Link to="/app" className="sidebar-team" aria-label="切换团队" onClick={closeSidebar}>
          <span className="team-avatar" aria-hidden="true">
            {team ? (Array.from(team.name)[0] ?? "团") : "团"}
          </span>
          <span className="team-info">
            <strong>{team?.name ?? "选择团队"}</strong>
            <small>
              {team ? `团队空间 · ${team.member_count} 位成员` : "创建或加入一个团队"}
            </small>
            {team ? <span className="invite-code">{team.invite_code}</span> : null}
          </span>
          <Icon name="chevron-down" />
        </Link>

        <nav className="side-nav" aria-label="工作台导航">
          {navItems.slice(0, teamId ? 4 : 1).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={closeSidebar}
              className={({ isActive }) => `side-nav-item${isActive ? " active" : ""}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-nav-section">
          <p className="side-nav-label">账户</p>
          <nav className="side-nav" aria-label="账户导航">
            {navItems.slice(teamId ? 4 : 1).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeSidebar}
                className={({ isActive }) => `side-nav-item${isActive ? " active" : ""}`}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-spacer" />

        <div className="sidebar-user">
          <span
            className="avatar"
            style={{ backgroundColor: me.data?.avatar_color ?? "#4f46e5" }}
            aria-hidden="true"
          >
            {initial}
          </span>
          <span className="user-meta">
            <strong className="header-name" title={me.data?.username}>
              {me.data?.display_name ?? (me.isPending ? "加载中…" : "未登录")}
            </strong>
            <small>
              {team?.my_role === "owner"
                ? "Owner"
                : team?.my_role === "admin"
                  ? "Admin"
                  : "成员"}
            </small>
          </span>
          <button type="button" className="icon-btn" onClick={handleLogout} aria-label="退出" title="退出">
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="app-body">
        <header className="app-topbar">
          <button
            type="button"
            className="icon-btn mobile-menu"
            aria-label={sidebarOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <Icon name={sidebarOpen ? "close" : "menu"} />
          </button>
          <div className="breadcrumb">
            <span>{team?.name ?? "我的团队"}</span>
            <Icon name="chevron-right" />
            <strong>{label}</strong>
          </div>
          <div className="topbar-actions">
            <LiveStatus />
            <Link to="/app/profile" className="topbar-user" aria-label="账户" onClick={closeSidebar}>
              <span
                className="avatar"
                style={{ backgroundColor: me.data?.avatar_color ?? "#4f46e5" }}
                aria-hidden="true"
              >
                {initial}
              </span>
            </Link>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
