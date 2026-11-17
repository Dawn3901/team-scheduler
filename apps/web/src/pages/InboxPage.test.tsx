import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEAM, USER, cleanupApp, jsonResponse, mockFetch, renderApp } from "../test/utils";

const ITEM = {
  kind: "mention" as const,
  target_type: "task" as const,
  target_id: 5,
  team_id: 1,
  title: "写文档",
  preview: "@林 帮忙看下格式",
  created_at: "2026-11-17T02:00:00Z",
  message: {
    id: 9,
    target_type: "task" as const,
    target_id: 5,
    kind: "comment" as const,
    body: "@林 帮忙看下格式",
    author: { user_id: 2, display_name: "陈", avatar_url: null },
    mention_user_ids: [1],
    created_at: "2026-11-17T02:00:00Z",
  },
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

describe("收件箱（CR-016 / MSG-3）", () => {
  it("展示三类计数与条目，打开时推进读位并跳到任务", async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      if (url === "/api/v1/inbox") {
        return jsonResponse({
          items: [ITEM],
          total: 1,
          counts: { announcements: 1, mentions: 1, messages: 0 },
        });
      }
      if (url === "/api/v1/read-marks" && init.method === "POST") {
        return new Response(null, { status: 204 });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    const user = userEvent.setup();

    renderApp(["/app/inbox"]);

    expect(await screen.findByRole("heading", { name: "收件箱" })).toBeInTheDocument();
    // 标题是静态的，条目要等 /inbox 返回。
    expect(await screen.findByText("写文档")).toBeInTheDocument();
    expect(screen.getByText("@我")).toBeInTheDocument();
    expect(screen.getByText(/1 条待确认通告/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /写文档/ }));

    await waitFor(() => {
      const mark = fetchMock.mock.calls.find(([url]) => url === "/api/v1/read-marks");
      expect(mark).toBeTruthy();
      expect(JSON.parse(String(mark![1]!.body))).toEqual({ target_type: "task", target_id: 5 });
    });
  });

  it("空收件箱给出引导文案", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/inbox") {
        return jsonResponse({ items: [], total: 0, counts: { announcements: 0, mentions: 0, messages: 0 } });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/inbox"]);

    expect(await screen.findByText(/收件箱是空的/)).toBeInTheDocument();
  });
});
