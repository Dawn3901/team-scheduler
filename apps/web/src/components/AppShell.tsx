import { useQueryClient } from "@tanstack/react-query";
import { logout } from "@teamsync/shared";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { useMe } from "../hooks/useSession";

export function AppShell() {
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  const initial = me.data ? (Array.from(me.data.display_name)[0] ?? "?") : "?";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/app" className="brand brand-link">
            <span className="brand-mark" aria-hidden="true">
              同
            </span>
            <span>TeamSync</span>
          </Link>

          <nav className="header-nav" aria-label="主导航">
            <NavLink to="/app" end>
              我的团队
            </NavLink>
          </nav>

          <div className="header-user">
            {me.data ? (
              <>
                <span
                  className="avatar"
                  style={{ backgroundColor: me.data.avatar_color }}
                  aria-hidden="true"
                >
                  {initial}
                </span>
                <span className="header-name" title={me.data.username}>
                  {me.data.display_name}
                </span>
              </>
            ) : (
              <span className="header-name muted">{me.isPending ? "加载中…" : "未登录"}</span>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
