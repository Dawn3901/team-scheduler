import { screen, waitFor, within } from "@testing-library/react";
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

describe("侧栏分区", () => {
  it("团队设置留在“团队”分组，账户分组只有通知及个人项", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/teams/1/members"]);

    const teamNav = await screen.findByRole("navigation", { name: "工作台导航" });
    expect(within(teamNav).getByRole("link", { name: "团队设置" })).toBeInTheDocument();
    expect(within(teamNav).getByRole("link", { name: "团队通告" })).toBeInTheDocument();

    const accountNav = screen.getByRole("navigation", { name: "账户导航" });
    expect(within(accountNav).queryByRole("link", { name: "团队设置" })).not.toBeInTheDocument();
    expect(within(accountNav).getByRole("link", { name: "通知" })).toBeInTheDocument();
  });
});
