import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEAM, USER, cleanupApp, jsonResponse, mockFetch, renderApp } from "../test/utils";

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

describe("顶部面包屑", () => {
  it("个人日程显示 个人空间 > 我的日程，不是 团队日历", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      if (url.startsWith("/api/v1/me/agenda")) {
        return jsonResponse({ from: "", to: "", events: [], tasks: [] });
      }
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/me/calendar"]);

    const breadcrumb = await waitFor(() => {
      const node = document.querySelector(".breadcrumb");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(breadcrumb).toHaveTextContent("个人空间");
    expect(breadcrumb).toHaveTextContent("我的日程");
    expect(breadcrumb).not.toHaveTextContent("团队日历");
  });

  it("团队日历仍显示团队名 > 团队日历", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/teams/1/members"]);

    // 团队名来自 /teams/1，异步加载完成后再断言。
    await waitFor(() => {
      expect(document.querySelector(".breadcrumb")).toHaveTextContent(TEAM.name);
    });
    expect(document.querySelector(".breadcrumb")).toHaveTextContent("团队成员");
  });
});
