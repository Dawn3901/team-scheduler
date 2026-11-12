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
