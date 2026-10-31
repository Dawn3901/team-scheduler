import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { TeamLayout } from "./components/TeamLayout";
import { useUnauthorizedRedirect } from "./hooks/useUnauthorizedRedirect";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TeamPlaceholderPage from "./pages/TeamPlaceholderPage";
import TeamSelectPage from "./pages/TeamSelectPage";

export default function App() {
  useUnauthorizedRedirect();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/app" element={<TeamSelectPage />} />

          <Route path="/app/teams/:teamId" element={<TeamLayout />}>
            <Route index element={<Navigate to="calendar" replace />} />
            <Route
              path="calendar"
              element={
                <TeamPlaceholderPage
                  title="日历"
                  description="月 / 周 / 日视图、忙闲与冲突提示将在这里呈现。"
                />
              }
            />
            <Route
              path="tasks"
              element={
                <TeamPlaceholderPage
                  title="任务"
                  description="团队任务的列表、指派与完成状态将在这里呈现。"
                />
              }
            />
            <Route
              path="members"
              element={
                <TeamPlaceholderPage
                  title="成员"
                  description="成员角色、邀请码与移除操作将在这里呈现。"
                />
              }
            />
            <Route
              path="settings"
              element={
                <TeamPlaceholderPage
                  title="设置"
                  description="团队资料、时区与邀请码轮换将在这里呈现。"
                />
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
