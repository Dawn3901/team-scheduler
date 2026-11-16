import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TEAM, USER, cleanupApp, jsonResponse, mockFetch, renderApp } from "../test/utils";

beforeEach(() => {
  vi.stubGlobal("WebSocket", undefined);
  localStorage.clear();
  localStorage.setItem("teamsync.token", "token-1");
  localStorage.setItem("teamsync.tutorial.seen", "1");
});
afterEach(async () => { await cleanupApp(); vi.unstubAllGlobals(); localStorage.clear(); });

it("对话仅生成草稿，明确确认后才创建，并能隐藏恢复", async () => {
  let creates = 0;
  mockFetch((url, init) => {
    if (url === "/api/v1/auth/me") return jsonResponse(USER);
    if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
    if (url.startsWith("/api/v1/teams?")) return jsonResponse({ items: [TEAM], total: 1 });
    if (url.endsWith("/assistant/chat")) return jsonResponse({ answer: "请核对草稿", draft: {
      title: "AI 项目会", start_at: "2035-01-01T07:00:00Z", end_at: "2035-01-01T08:00:00Z",
      all_day: false, visibility: "team", participant_ids: [],
    } });
    if (url.endsWith("/events") && init?.method === "POST") { creates++; return jsonResponse({ id: 123 }); }
    return jsonResponse({ items: [], total: 0 });
  });
  renderApp(["/app/teams/1/members"]);
  fireEvent.click(await screen.findByRole("button", { name: "✦ AI 助手" }), { detail: 0 });
  fireEvent.change(await screen.findByLabelText("给 AI 助手发送消息"), { target: { value: "明天下午创建项目会" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  expect(await screen.findByText("请核对草稿")).toBeVisible();
  expect(creates).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "确认创建活动" }));
  expect(await screen.findByRole("link", { name: "查看活动" })).toHaveAttribute("href", "/app/teams/1/events/123");
  expect(creates).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "隐藏 AI 助手" }));
  expect(screen.queryByLabelText("AI 助手", { selector: "aside" })).toBeNull();
  expect(localStorage.getItem("teamsync.ai.hidden")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "显示 AI 助手" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "✦ AI 助手" })).toBeVisible());
});

it("服务不可用时保留输入供重试", async () => {
  mockFetch(url => {
    if (url === "/api/v1/auth/me") return jsonResponse(USER);
    if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
    if (url.startsWith("/api/v1/teams?")) return jsonResponse({ items: [TEAM], total: 1 });
    if (url.endsWith("/assistant/chat")) return jsonResponse({ code: "AI_UNAVAILABLE", message: "AI 未配置", details: {} }, 503);
    return jsonResponse({ items: [], total: 0 });
  });
  renderApp(["/app/teams/1/members"]);
  fireEvent.click(await screen.findByRole("button", { name: "✦ AI 助手" }), { detail: 0 });
  fireEvent.change(await screen.findByLabelText("给 AI 助手发送消息"), { target: { value: "我的待办" } });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("AI 未配置");
  expect(screen.getByLabelText("给 AI 助手发送消息")).toHaveValue("我的待办");
});
