import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEAM, USER, cleanupApp, jsonResponse, mockFetch, renderApp } from "../test/utils";

const ANNOUNCEMENT = {
  id: 3,
  team_id: 1,
  title: "周五例会改期",
  body: "改到 16:00，全员必到",
  pinned: true,
  requires_ack: true,
  acked: false,
  ack_count: 1,
  member_count: 3,
  expires_at: null,
  expired: false,
  created_at: "2026-11-17T02:00:00Z",
  can_manage: true,
  author: { user_id: 1, display_name: "林", avatar_url: null },
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

function announcementsFetch(overrides: Record<string, (init?: RequestInit) => Response> = {}) {
  return mockFetch((url, init) => {
    if (url === "/api/v1/auth/me") return jsonResponse(USER);
    if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
    const key = `${init.method ?? "GET"} ${url.split("?")[0]}`;
    if (overrides[key]) return overrides[key](init);
    if (url.startsWith("/api/v1/teams/1/announcements")) {
      return jsonResponse({ items: [ANNOUNCEMENT], total: 1, unacked_count: 1 });
    }
    if (url.startsWith("/api/v1/inbox")) {
      return jsonResponse({ items: [], total: 0, counts: { announcements: 1, mentions: 0, messages: 0 } });
    }
    return jsonResponse({ items: [], total: 0 });
  });
}

describe("团队通告（CR-016 / ANNC）", () => {
  it("列出通告、显示回执进度，点“我知道了”调用 ack 接口", async () => {
    const fetchMock = announcementsFetch({
      "POST /api/v1/announcements/3/ack": () =>
        jsonResponse({ ...ANNOUNCEMENT, acked: true, ack_count: 2 }),
    });
    const user = userEvent.setup();

    renderApp(["/app/teams/1/announcements"]);

    expect(await screen.findByText("周五例会改期")).toBeInTheDocument();
    expect(screen.getByText("改到 16:00，全员必到")).toBeInTheDocument();
    expect(screen.getByLabelText("已确认 1/3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "我知道了" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) =>
        url === "/api/v1/announcements/3/ack" && init?.method === "POST")).toBe(true),
    );
  });

  it("管理员发布通告时提交标题、正文与“需要确认”选项", async () => {
    const fetchMock = announcementsFetch({
      "POST /api/v1/teams/1/announcements": () => jsonResponse({ ...ANNOUNCEMENT, id: 9 }, 201),
    });
    const user = userEvent.setup();

    renderApp(["/app/teams/1/announcements"]);
    await screen.findByText("周五例会改期");
    await user.click(screen.getByRole("button", { name: "发布通告" }));

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "新通告" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "正文内容" } });
    await user.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) =>
        url === "/api/v1/teams/1/announcements" && init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post![1]!.body))).toMatchObject({
        title: "新通告",
        body: "正文内容",
        requires_ack: true,
        pinned: false,
      });
    });
  });

  it("作者可以打开回执名单，看到谁已确认、谁未确认", async () => {
    announcementsFetch({
      "GET /api/v1/announcements/3/receipts": () =>
        jsonResponse({
          items: [
            { user_id: 1, display_name: "林", avatar_url: null, acked: true, acked_at: "2026-11-17T03:00:00Z" },
            { user_id: 2, display_name: "陈", avatar_url: null, acked: false, acked_at: null },
          ],
          total: 2,
          acked_count: 1,
        }),
    });
    const user = userEvent.setup();

    renderApp(["/app/teams/1/announcements"]);
    await screen.findByText("周五例会改期");
    await user.click(screen.getByRole("button", { name: "回执" }));

    expect(await screen.findByRole("dialog", { name: "回执名单" })).toBeInTheDocument();
    expect(screen.getByText("已确认 1/2")).toBeInTheDocument();
    expect(screen.getByText("未确认")).toBeInTheDocument();
  });

  it("普通成员看不到“发布通告”入口", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse({ ...TEAM, my_role: "member" });
      if (url.startsWith("/api/v1/teams/1/announcements")) {
        return jsonResponse({
          items: [{ ...ANNOUNCEMENT, can_manage: false, acked: true }],
          total: 1,
          unacked_count: 0,
        });
      }
      if (url.startsWith("/api/v1/inbox")) {
        return jsonResponse({ items: [], total: 0, counts: { announcements: 0, mentions: 0, messages: 0 } });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/teams/1/announcements"]);

    await screen.findByText("周五例会改期");
    expect(screen.queryByRole("button", { name: "发布通告" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "回执" })).not.toBeInTheDocument();
  });
});
