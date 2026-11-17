import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEAM, USER, cleanupApp, jsonResponse, mockFetch, renderApp } from "../test/utils";

const START = "2026-12-01T02:00:00Z";
const END = "2026-12-01T03:00:00Z";

function participant(overrides: Record<string, unknown>) {
  return {
    user_id: 2,
    display_name: "组员",
    response: "pending",
    is_organizer: false,
    needs_confirmation: false,
    note: null,
    ...overrides,
  };
}

function eventBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    team_id: 1,
    title: "评审会",
    description: "",
    start_at: START,
    end_at: END,
    all_day: false,
    location: "",
    color: "#4F46E5",
    visibility: "team",
    status: "confirmed",
    created_by: 1,
    updated_at: "2026-11-17T02:00:00Z",
    my_response: "pending",
    my_needs_confirmation: false,
    participants: [
      participant({ user_id: 1, display_name: "林", response: "accepted", is_organizer: true }),
      participant({ user_id: 2, display_name: "组员" }),
    ],
    ...overrides,
  };
}

function renderEvent(body = eventBody(), me = USER) {
  mockFetch((url) => {
    if (url === "/api/v1/auth/me") return jsonResponse(me);
    if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
    if (url === "/api/v1/events/7") return jsonResponse(body);
    if (url.startsWith("/api/v1/members")) return jsonResponse({ items: [], total: 0 });
    if (url.startsWith("/api/v1/messages")) return jsonResponse({ items: [], has_more: false, next_before_id: null });
    if (url.startsWith("/api/v1/events/7/messages")) {
      return jsonResponse({ items: [], has_more: false, next_before_id: null });
    }
    if (url.startsWith("/api/v1/inbox")) {
      return jsonResponse({ items: [], total: 0, counts: { announcements: 0, mentions: 0, messages: 0 } });
    }
    return jsonResponse({ items: [], total: 0 });
  });
  return renderApp(["/app/teams/1/events/7"]);
}

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

describe("活动详情：参与者行内回应（CR-016）", () => {
  it("普通参与者在自己的行里看到三个按钮，待回应时都不高亮", async () => {
    // 我是 2 号（组员），不是组织者。
    renderEvent(eventBody({
      created_by: 1,
      my_response: "pending",
      participants: [
        participant({ user_id: 1, display_name: "林", response: "accepted", is_organizer: true }),
        participant({ user_id: 2, display_name: "组员" }),
      ],
    }), { ...USER, id: 2, display_name: "组员" });

    const mine = await waitFor(() => {
      const row = document.querySelector(".participant-row.is-me");
      expect(row).not.toBeNull();
      return row as HTMLElement;
    });
    for (const label of ["接受", "待定", "拒绝"]) {
      expect(within(mine).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
    // 组织者自己那行不给按钮。
    const ownerRow = document.querySelectorAll(".participant-row")[0] as HTMLElement;
    expect(within(ownerRow).queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument();
  });

  it("已接受时只有“接受”高亮，点击“待定”调用 rsvp 接口", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse({ ...USER, id: 2, display_name: "组员" });
      if (url === "/api/v1/teams/1") return jsonResponse(TEAM);
      if (url === "/api/v1/events/7") {
        return jsonResponse(eventBody({
          my_response: "accepted",
          participants: [
            participant({ user_id: 1, display_name: "林", response: "accepted", is_organizer: true }),
            participant({ user_id: 2, display_name: "组员", response: "accepted" }),
          ],
        }));
      }
      if (url === "/api/v1/events/7/rsvp") return jsonResponse(participant({ response: "tentative" }));
      if (url.startsWith("/api/v1/inbox")) {
        return jsonResponse({ items: [], total: 0, counts: { announcements: 0, mentions: 0, messages: 0 } });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    renderApp(["/app/teams/1/events/7"]);
    const user = userEvent.setup();

    const mine = await waitFor(() => {
      const row = document.querySelector(".participant-row.is-me");
      expect(row).not.toBeNull();
      return row as HTMLElement;
    });
    expect(within(mine).getByRole("button", { name: "接受" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(mine).getByRole("button", { name: "待定" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url, init]) =>
        url === "/api/v1/events/7/rsvp" && init?.method === "PATCH")).toBe(true),
    );
  });

  it("组织者看到状态标签和红色 × 移除邀请，没有“加备注”", async () => {
    renderEvent();

    const row = await waitFor(() => {
      // 第一行是组织者，第二行才是被邀请的组员。
      const rows = document.querySelectorAll(".participant-row");
      expect(rows.length).toBeGreaterThan(1);
      return rows[1] as HTMLElement;
    });
    expect(within(row).getByText("组员")).toBeInTheDocument();
    expect(screen.getByText("待回应")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /移除 组员 的邀请/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /加备注|改备注/ })).not.toBeInTheDocument();
    // 编辑权限下才有取消活动，且没有“删除活动”。
    expect(screen.getByRole("button", { name: "取消活动" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除活动" })).not.toBeInTheDocument();
  });

  it("附言只对组织者/本人显示，且标注为“附言”", async () => {
    renderEvent(eventBody({
      participants: [
        participant({ user_id: 1, display_name: "林", response: "accepted", is_organizer: true }),
        participant({ user_id: 2, display_name: "组员", response: "tentative", note: "我会迟到 10 分钟" }),
      ],
    }));

    expect(await screen.findByText("附言：我会迟到 10 分钟")).toBeInTheDocument();
  });
});
