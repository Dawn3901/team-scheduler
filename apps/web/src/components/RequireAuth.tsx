import { getToken } from "@teamsync/shared";
import { Navigate, Outlet, useLocation } from "react-router-dom";

/** 无 token 直接去登录页；token 是否有效由 /auth/me 与 401 事件兜底。 */
export function RequireAuth() {
  const location = useLocation();

  if (!getToken()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}
