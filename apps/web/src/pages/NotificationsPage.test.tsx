import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { USER, cleanupApp, jsonResponse, mockFetch, renderApp } from "../test/utils";

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

describe("通知中心", () => {
  it("“仅显示未读”是按钮，按下后切换为“显示全部”并带 unread_only=true", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      return jsonResponse({ items: [], total: 0, unread_count: 0 });
    });
    const user = userEvent.setup();

    renderApp(["/app/notifications"]);

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
});
