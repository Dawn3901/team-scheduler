import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchInbox, logout } from "@teamsync/shared";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import AiAssistant from "./AiAssistant";
import LiveStatus from "./LiveStatus";
import { useMe, useTeam } from "../hooks/useSession";

const pageLabels: Record<string, string> = {
  calendar: "团队日历",
  tasks: "任务看板",
  members: "团队成员",
  settings: "团队设置",
  notifications: "通知",
  profile: "个人资料",
  tutorial: "新手教程",
  about: "关于",
  me: "我的日程",
  inbox: "通知",
  announcements: "团队通告",
};

function pageLabel(pathname: string): string {
  if (/\/events\/\d+/.test(pathname)) return "活动详情";
  // 个人空间路由 /app/me/calendar 的末段是 calendar，不能命中“团队日历”。
  if (/^\/app\/me\//.test(pathname)) return pageLabels.me;
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return pageLabels[segment] ?? "我的团队";
}

export function AppShell() {
  const [aiVisible, setAiVisible] = useState(() => localStorage.getItem("teamsync.ai.hidden") !== "true");
  const toggleAi = () => setAiVisible(prev => { localStorage.setItem("teamsync.ai.hidden", String(prev)); return !prev; });
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 通知角标 = 待处理数（合并收件箱后唯一来源）：离开页面也要更新，因此轮询。
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: fetchInbox, refetchInterval: 60000 });
  // 接口失败或返回不完整时不能影响整个外壳渲染。
  const inboxTotal = inbox.data?.total ?? 0;
  const unackedAnnouncements = inbox.data?.counts?.announcements ?? 0;

  const match = location.pathname.match(/^\/app\/teams\/(\d+)/);
  const teamId = match ? Number(match[1]) : 0;
  const team = useTeam(teamId).data;
  const label = pageLabel(location.pathname);
  const avatarUser = me.data ? { name: me.data.display_name, color: me.data.avatar_color, url: me.data.avatar_url } : null;

  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  const navItems: Array<{ to: string; label: string; icon: IconName; end?: boolean; badge?: number }> = teamId
    ? [
        { to: `/app/teams/${teamId}/calendar`, label: "团队日历", icon: "calendar" },
        { to: `/app/teams/${teamId}/tasks`, label: "任务看板", icon: "tasks" },
        { to: `/app/teams/${teamId}/announcements`, label: "团队通告", icon: "bell", badge: unackedAnnouncements },
        { to: `/app/teams/${teamId}/members`, label: "团队成员", icon: "users" },
        { to: `/app/teams/${teamId}/settings`, label: "团队设置", icon: "settings" },
        { to: "/app/notifications", label: "通知", icon: "bell", badge: inboxTotal },
        { to: "/app/profile", label: "个人资料", icon: "user" },
        { to: "/app/me/calendar", label: "我的日程", icon: "user" },
        { to: "/app/tutorial", label: "新手教程", icon: "help" },
        { to: "/app/about", label: "关于", icon: "info" },
      ]
    : [
        { to: "/app", label: "我的团队", icon: "users", end: true },
        { to: "/app/notifications", label: "通知", icon: "bell", badge: inboxTotal },
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
              {item.badge ? <span className="nav-badge" aria-label={`${item.badge} 条待处理`}>{item.badge}</span> : null}
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
          <Avatar className="avatar" {...(avatarUser ?? { name: "", color: "#4f46e5" })} />
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

      {aiVisible && <AiAssistant currentTeamId={teamId} onHide={toggleAi} />}
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
            <span>{/^\/app\/me\//.test(location.pathname) ? "个人空间" : (team?.name ?? "我的团队")}</span>
            <Icon name="chevron-right" />
            <strong>{label}</strong>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn btn-ghost" onClick={toggleAi}>{aiVisible ? "隐藏 AI" : "显示 AI 助手"}</button>
            <LiveStatus />
            <Link to="/app/profile" className="topbar-user" aria-label="账户" onClick={closeSidebar}>
              <Avatar className="avatar" {...(avatarUser ?? { name: "", color: "#4f46e5" })} />
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
