import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../components/ToastProvider";
import { USER, jsonResponse } from "../test/utils";
import PersonalCalendarPage from "./PersonalCalendarPage";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();

const agenda = {
  from: iso(-7 * 86400000),
  to: iso(7 * 86400000),
  events: [
    {
      id: "e:31", source_id: 31, kind: "team_event", title: "周会",
      start_at: iso(3 * 3600000), end_at: iso(4 * 3600000), all_day: false, location: null,
      team_id: 2, team_name: "软工大作业", my_response: "pending", needs_confirmation: false, status: "confirmed",
    },
    {
      id: "p:12", source_id: 12, kind: "personal", title: "宿舍",
      start_at: iso(26 * 3600000), end_at: iso(27 * 3600000), all_day: false, location: "宿舍",
      team_id: null, team_name: null, my_response: null, needs_confirmation: false, status: "confirmed",
    },
  ],
  tasks: [
    { id: 41, team_id: 3, team_name: "软工大作业", title: "补交报告", status: "todo", priority: "high", due_at: iso(-86400000), overdue: true },
  ],
};

beforeEach(() => {
  vi.stubGlobal("WebSocket", undefined);
  localStorage.clear();
  localStorage.setItem("teamsync.token", "token-1");
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/auth/me") return Promise.resolve(jsonResponse(USER));
      if (url.startsWith("/api/v1/me/agenda")) return Promise.resolve(jsonResponse(agenda));
      return Promise.resolve(jsonResponse({ items: [], total: 0 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderPage(route = "/app/me/calendar") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <PersonalCalendarPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("个人日历", () => {
  it("默认周视图，只有 月/周/任务清单 三个视图，没有单日", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "我的日程" })).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "日历视图" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "周" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "任务清单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "日" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "周" })).toHaveAttribute("aria-pressed", "true");
  });

  it("切到任务清单显示逾期任务并带紧急样式", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "任务清单" }));

    expect(await screen.findByText("补交报告")).toBeInTheDocument();
    const row = screen.getByText("补交报告").closest("li");
    expect(row).toHaveClass("personal-row-urgent");
    expect(screen.getByText(/已逾期/)).toBeInTheDocument();
  });

  it("颜色说明包含红/蓝/绿三种语义", async () => {
    renderPage();
    expect(await screen.findByLabelText("颜色说明")).toHaveTextContent("红：紧急");
    expect(screen.getByLabelText("颜色说明")).toHaveTextContent("蓝：活动待回应");
    expect(screen.getByLabelText("颜色说明")).toHaveTextContent("绿：正常");
  });
});
