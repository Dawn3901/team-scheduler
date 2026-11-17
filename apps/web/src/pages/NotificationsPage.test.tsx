import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { USER, cleanupApp, jsonResponse, mockFetch, overrideDefaults, renderApp } from "../test/utils";

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

describe("通知 · 全部动态", () => {
  it("“仅显示未读”是按钮，按下后切换为“显示全部”并带 unread_only=true", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      return jsonResponse({ items: [], total: 0, unread_count: 0 });
    });
    const user = userEvent.setup();

    // 合并后默认落在“待处理”，动态列表在“全部动态”标签。
    renderApp(["/app/notifications?tab=all"]);

    const toggle = await screen.findByRole("button", { name: "仅显示未读" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "显示全部" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("unread_only=true")),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "显示全部" }));
    expect(await screen.findByRole("button", { name: "仅显示未读" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("unread_only=false")),
    ).toBe(true);
  });

  it("同一活动的同类通知合并为一组，可展开历史", async () => {
    overrideDefaults("notifications");
    const notice = (id: number, title: string, createdAt: string, type = "event.updated") => ({
      id,
      type,
      title,
      body: null,
      payload: { team_id: 1, event_id: 12 },
      read_at: null,
      created_at: createdAt,
    });
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url.startsWith("/api/v1/notifications?"))
        return jsonResponse({
          items: [
            notice(3, "「评审」时间/地点已变更，请重新确认", "2026-11-16T10:00:00Z"),
            notice(2, "「评审-旧」时间/地点已变更，请重新确认", "2026-11-15T10:00:00Z"),
            notice(1, "评审", "2026-11-14T10:00:00Z", "event.invited"),
          ],
          total: 3,
          unread_count: 3,
        });
      return jsonResponse({ items: [], total: 0 });
    });
    const user = userEvent.setup();

    // 合并后默认落在“待处理”，动态列表在“全部动态”标签。
    renderApp(["/app/notifications?tab=all"]);

    // 变更 2 条合并为一组，邀请 1 条自成一组。
    await screen.findByText("活动变更");
    expect(screen.getByText("活动邀请")).toBeInTheDocument();
    expect(screen.getAllByTestId("notice-group")).toHaveLength(2);
    // 组内只展示最近一条，并提示合并数量与原标题。
    expect(screen.getByText("「评审」时间/地点已变更，请重新确认")).toBeInTheDocument();
    expect(screen.queryByText("「评审-旧」时间/地点已变更，请重新确认")).not.toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "另 1 条" }));
    expect(screen.getByRole("list", { name: "同类通知历史" })).toBeInTheDocument();
    expect(screen.getByText("「评审-旧」时间/地点已变更，请重新确认")).toBeInTheDocument();
  });
});

describe("通知 · 标签合并", () => {
  it("默认打开“全部动态”，可切到“待处理”", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/inbox") {
        return jsonResponse({ items: [], total: 0, counts: { announcements: 0, mentions: 0, messages: 0 } });
      }
      return jsonResponse({ items: [], total: 0, unread_count: 0 });
    });
    const user = userEvent.setup();

    renderApp(["/app/notifications"]);

    expect(await screen.findByRole("tab", { name: "全部动态" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: "全部已读" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/v1/notifications?")),
    ).toBe(true);

    await user.click(screen.getByRole("tab", { name: "待处理" }));
    expect(screen.getByRole("tab", { name: "待处理" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText(/没有待处理的事/)).toBeInTheDocument();
  });

  it("旧链接 /app/inbox 跳到通知页的待处理", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/inbox") {
        return jsonResponse({ items: [], total: 0, counts: { announcements: 0, mentions: 0, messages: 0 } });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/inbox"]);

    expect(await screen.findByRole("heading", { name: "通知" })).toBeInTheDocument();
    expect(await screen.findByRole("tab", { name: "待处理" })).toHaveAttribute("aria-selected", "true");
  });
});
