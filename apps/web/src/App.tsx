import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { TeamLayout } from "./components/TeamLayout";
import { useUnauthorizedRedirect } from "./hooks/useUnauthorizedRedirect";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
import TasksPage from "./pages/TasksPage";
import MembersPage from "./pages/MembersPage";
import SettingsPage from "./pages/SettingsPage";
import EventPage from "./pages/EventPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import TutorialPage from "./pages/TutorialPage";
import AboutPage from "./pages/AboutPage";
import TeamSelectPage from "./pages/TeamSelectPage";

export default function App() {
  useUnauthorizedRedirect();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/app/notifications" element={<NotificationsPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />
          <Route path="/app/tutorial" element={<TutorialPage />} />
          <Route path="/app/about" element={<AboutPage />} />
          <Route path="/app" element={<TeamSelectPage />} />

          <Route path="/app/teams/:teamId" element={<TeamLayout />}>
            <Route index element={<Navigate to="calendar" replace />} />
            <Route path="calendar" element={<Suspense fallback={<p>日历加载中…</p>}><CalendarPage /></Suspense>} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="events/:eventId" element={<EventPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
