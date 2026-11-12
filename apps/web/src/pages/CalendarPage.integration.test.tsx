import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CalendarPage from "./CalendarPage";
import { ToastProvider } from "../components/ToastProvider";
import { TEAM, USER, jsonResponse } from "../test/utils";

const PRIVATE_EVENT = {
  id: 11,
  team_id: TEAM.id,
  title: "线上买药",
  description: null,
  start_at: "2026-11-12T06:00:00Z",
  end_at: "2026-11-12T08:00:00Z",
  all_day: false,
  location: null,
  color: null,
  visibility: "private",
  status: "confirmed",
  created_by: USER.id,
  updated_at: "2026-11-12T00:00:00Z",
  my_response: "accepted",
  participants: [],
};

// AppShell 使用 lazy 路由；这里直接渲染 CalendarPage，验证配色与忙闲层。
// 本用例覆盖“忙碌块与活动时间段不同”时，靠「仅我」条件仍去掉斜纹。
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-12T03:00:00Z"));
  vi.stubGlobal("WebSocket", undefined);
  localStorage.clear();
  localStorage.setItem("teamsync.token", "token-1");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("团队日历私密活动", () => {
  it("自己的私密活动不叠加灰色忙碌斜纹", async () => {
    // 不用 mockFetch 的默认分支：它会拦截 /events? 与 /members? 查询。
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      if (url.startsWith("/api/v1/teams/1/events")) {
        return jsonResponse({ items: [PRIVATE_EVENT], total: 1 });
      }
      if (url.startsWith("/api/v1/teams/1/availability")) {
        return jsonResponse({
          from: "2026-11-09T00:00:00Z",
          to: "2026-11-16T00:00:00Z",
          members: [
            {
              user_id: USER.id,
              display_name: USER.display_name,
              blocks: [
                {
                  start_at: PRIVATE_EVENT.start_at,
                  end_at: PRIVATE_EVENT.end_at,
                  all_day: false,
                  busy: true,
                  event_id: null,
                  title: null,
                  visibility: "private",
                },
              ],
            },
          ],
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/teams/1/calendar"]}>
          <ToastProvider>
            <Routes>
              <Route path="/app/teams/:teamId/calendar" element={<CalendarPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "团队日历" })).toBeInTheDocument();
    expect(await screen.findByText("线上买药")).toBeInTheDocument();
    expect(document.querySelectorAll(".timeline-busy-block")).toHaveLength(0);
  });
});

describe("忙碌块时间格式差异", () => {
  it("忙闲返回微秒或 +00:00 时，自己的活动也不会叠斜纹", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      if (url.startsWith("/api/v1/teams/1/events")) {
        return jsonResponse({ items: [PRIVATE_EVENT], total: 1 });
      }
      if (url.startsWith("/api/v1/teams/1/availability")) {
        return jsonResponse({
          from: "2026-11-09T00:00:00Z",
          to: "2026-11-16T00:00:00Z",
          members: [
            {
              user_id: USER.id,
              display_name: USER.display_name,
              blocks: [
                {
                  start_at: "2026-11-12T06:00:00.123456Z",
                  end_at: "2026-11-12T08:00:00+00:00",
                  all_day: false,
                  busy: true,
                  event_id: null,
                  title: null,
                  visibility: "private",
                },
              ],
            },
          ],
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/teams/1/calendar"]}>
          <ToastProvider>
            <Routes>
              <Route path="/app/teams/:teamId/calendar" element={<CalendarPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("线上买药")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelectorAll(".timeline-busy-block")).toHaveLength(0);
  });
});

describe("「仅我」筛选展示个人日程", () => {
  it("个人事件显示为可点事件（灰色私人块），不再只是忙闲斜纹", async () => {
    const personal = {
      id: 21,
      title: "宿舍",
      description: null,
      start_at: "2026-11-13T05:00:00Z",
      end_at: "2026-11-13T06:00:00Z",
      all_day: false,
      location: "宿舍",
      color: null,
      share_busy: true,
      updated_at: "2026-11-12T00:00:00Z",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      if (url.startsWith("/api/v1/me/calendar")) {
        return jsonResponse({ items: [personal], total: 1 });
      }
      if (url.startsWith("/api/v1/teams/1/events")) {
        return jsonResponse({ items: [], total: 0 });
      }
      if (url.startsWith("/api/v1/teams/1/availability")) {
        return jsonResponse({
          from: "2026-11-09T00:00:00Z",
          to: "2026-11-16T00:00:00Z",
          members: [
            {
              user_id: USER.id,
              display_name: USER.display_name,
              blocks: [
                {
                  start_at: personal.start_at,
                  end_at: personal.end_at,
                  all_day: false,
                  busy: true,
                  event_id: null,
                  title: null,
                  visibility: "private",
                },
              ],
            },
          ],
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    window.sessionStorage.setItem(
      "teamsync.calendar.ui.1",
      JSON.stringify({ view: "week", date: "2026-11-12", member: "1", busy: true }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/teams/1/calendar"]}>
          <ToastProvider>
            <Routes>
              <Route path="/app/teams/:teamId/calendar" element={<CalendarPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("宿舍")).toBeInTheDocument();
    expect(document.querySelectorAll(".timeline-busy-block")).toHaveLength(0);
    window.sessionStorage.clear();
  });
});

describe("「仅我」筛选的兜底", () => {
  it("自己的忙碌块与可点活动时间段不同，也不画斜纹", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      // 模拟个人日历接口失败（旧后端/权限异常），此时不能依赖它判断“这是我的块”。
      if (url.startsWith("/api/v1/me/calendar")) {
        return jsonResponse({ items: [], total: 0 });
      }
      if (url.startsWith("/api/v1/teams/1/events")) {
        return jsonResponse({ items: [PRIVATE_EVENT], total: 1 });
      }
      if (url.startsWith("/api/v1/teams/1/availability")) {
        return jsonResponse({
          from: "2026-11-09T00:00:00Z",
          to: "2026-11-16T00:00:00Z",
          members: [
            {
              user_id: USER.id,
              display_name: USER.display_name,
              blocks: [
                {
                  start_at: "2026-11-13T05:00:00Z",
                  end_at: "2026-11-13T06:00:00Z",
                  all_day: false,
                  busy: true,
                  event_id: null,
                  title: null,
                  visibility: "private",
                },
              ],
            },
          ],
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);

    window.sessionStorage.setItem(
      "teamsync.calendar.ui.1",
      JSON.stringify({ view: "week", date: "2026-11-12", member: "1", busy: true }),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/teams/1/calendar"]}>
          <ToastProvider>
            <Routes>
              <Route path="/app/teams/:teamId/calendar" element={<CalendarPage />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("线上买药")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(document.querySelectorAll(".timeline-busy-block")).toHaveLength(0);
    window.sessionStorage.clear();
  });
});
