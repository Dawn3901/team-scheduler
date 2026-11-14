import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  USER,
  cleanupApp,
  jsonResponse,
  mockFetch,
  renderApp,
} from "../test/utils";

const personal = {
  id: 5,
  title: "面试",
  description: null,
  start_at: "2027-03-02T02:00:00Z",
  end_at: "2027-03-02T03:00:00Z",
  all_day: false,
  location: "线上",
  color: null,
  share_busy: true,
  updated_at: "2027-03-01T00:00:00Z",
};

beforeEach(() => {
  vi.stubGlobal("WebSocket", undefined);
  localStorage.clear();
  localStorage.setItem("teamsync.token", "token-1");
  localStorage.setItem("teamsync.tutorial.seen", "1");
});

afterEach(async () => {
  await cleanupApp();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("我的日程", () => {
  it("列出个人事件并显示共享状态", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url.startsWith("/api/v1/me/calendar")) {
        return jsonResponse({ items: [personal], total: 1 });
      }
      if (url.startsWith("/api/v1/me/team-events")) {
        return jsonResponse({ attending: [], invites: [] });
      }
      if (url === "/api/v1/me/tasks") return jsonResponse({ overdue: [], upcoming: [] });
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/me/calendar"]);

    expect(await screen.findByRole("heading", { name: "我的日程" })).toBeInTheDocument();
    expect(await screen.findByText("面试")).toBeInTheDocument();
    expect(screen.getAllByText(/参与团队忙闲/).length).toBeGreaterThan(0);
  });

  it("空状态可打开新建表单，提交 POST /me/events", async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url.startsWith("/api/v1/me/calendar")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/v1/me/team-events")) {
        return jsonResponse({ attending: [], invites: [] });
      }
      if (url === "/api/v1/me/tasks") return jsonResponse({ overdue: [], upcoming: [] });
      if (url === "/api/v1/me/events" && init.method === "POST") {
        return jsonResponse({ ...personal, id: 9 }, 201);
      }
      return jsonResponse({ items: [], total: 0 });
    });
    const user = userEvent.setup();

    renderApp(["/app/me/calendar"]);

    expect(await screen.findByText("还没有个人事件")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建第一条" }));
    await user.type(screen.getByLabelText("标题"), "通勤");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === "/api/v1/me/events" && init?.method === "POST",
        ),
      ).toBe(true);
    });
  });
});

describe("指派给我的任务（CR-012）", () => {
  it("按截止日展示任务并可跳到任务详情", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url.startsWith("/api/v1/me/calendar")) return jsonResponse({ items: [], total: 0 });
      if (url.startsWith("/api/v1/me/team-events")) {
        return jsonResponse({ attending: [], invites: [] });
      }
      if (url === "/api/v1/me/tasks") {
        return jsonResponse({
          overdue: [
            {
              id: 41,
              team_id: 3,
              team_name: "软工大作业",
              title: "补交实验报告",
              status: "todo",
              priority: "high",
              due_at: "2026-11-01T02:00:00Z",
              overdue: true,
            },
          ],
          upcoming: [],
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/me/calendar"]);

    expect(await screen.findByText("补交实验报告")).toBeInTheDocument();
    expect(screen.getByText(/已逾期/)).toBeInTheDocument();
    // 任务行按紧急度着色，与日历任务颜色同源。
    const row = screen.getByText("补交实验报告").closest("li");
    expect(row).toHaveClass("personal-row-urgent");
    expect(row?.getAttribute("style")).toContain("dc2626");
    expect(screen.getByRole("link", { name: "查看任务" })).toHaveAttribute(
      "href",
      "/app/teams/3/tasks?task=41",
    );
  });
});

describe("团队活动并入我的日程（CR-011）", () => {
  it("展示待回应邀请与已接受活动，并链接到团队活动详情", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url.startsWith("/api/v1/me/calendar")) return jsonResponse({ items: [], total: 0 });
      if (url === "/api/v1/me/tasks") return jsonResponse({ overdue: [], upcoming: [] });
      if (url.startsWith("/api/v1/me/team-events")) {
        return jsonResponse({
          attending: [
            {
              id: 31,
              team_id: 2,
              team_name: "软工大作业",
              title: "团队周会",
              start_at: "2027-03-03T02:00:00Z",
              end_at: "2027-03-03T03:00:00Z",
              all_day: false,
              location: "线上",
              visibility: "team",
              my_response: "accepted",
              needs_confirmation: false,
              local_date: "2027-03-03",
            },
          ],
          invites: [
            {
              id: 32,
              team_id: 2,
              team_name: "软工大作业",
              title: "评审",
              start_at: "2027-03-04T02:00:00Z",
              end_at: "2027-03-04T03:00:00Z",
              all_day: false,
              location: null,
              visibility: "team",
              my_response: "pending",
              needs_confirmation: false,
              local_date: "2027-03-04",
            },
          ],
        });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/me/calendar"]);

    expect(await screen.findByText("团队周会")).toBeInTheDocument();
    // 页面说明里也写了“待我回应”，这里只断言列表项里的标记。
    expect(screen.getAllByText(/待我回应/).length).toBeGreaterThan(1);
    const links = screen.getAllByRole("link", { name: "查看活动" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/app/teams/2/events/31",
      "/app/teams/2/events/32",
    ]);
  });
});
