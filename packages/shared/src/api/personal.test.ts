import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setToken } from "./client";
import {
  createPersonalEvent,
  deletePersonalEvent,
  listPersonalEvents,
  updatePersonalEvent,
  type PersonalEvent,
} from "./personal";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const EVENT: PersonalEvent = {
  id: 7,
  title: "面试",
  description: null,
  start_at: "2027-03-01T01:00:00Z",
  end_at: "2027-03-01T02:00:00Z",
  all_day: false,
  location: "线上",
  color: null,
  share_busy: true,
  updated_at: "2027-03-01T01:00:00Z",
};

beforeEach(() => {
  localStorage.clear();
  setToken("token-1");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("personal calendar api", () => {
  it("按范围查询个人日历并带上 from/to", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [EVENT], total: 1 }));

    const result = await listPersonalEvents("2027-03-01T00:00:00Z", "2027-03-08T00:00:00Z");

    expect(result.total).toBe(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/me/calendar?from=2027-03-01T00%3A00%3A00Z");
  });

  it("创建、更新、删除走 /me/events", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(EVENT, 201))
      .mockResolvedValueOnce(jsonResponse({ ...EVENT, title: "改期" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const created = await createPersonalEvent({
      title: "面试",
      start_at: EVENT.start_at,
      end_at: EVENT.end_at,
      all_day: false,
      share_busy: true,
    });
    expect(created.id).toBe(7);

    const updated = await updatePersonalEvent(7, { title: "改期" });
    expect(updated.title).toBe("改期");

    await deletePersonalEvent(7);

    const paths = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(paths[0]).toContain("/me/events");
    expect(paths[1]).toContain("/me/events/7");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PATCH");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("DELETE");
  });
});

describe("my tasks feed", () => {
  it("请求 /me/tasks", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ overdue: [], upcoming: [] }));

    const { listMyTasks } = await import("./personal");
    expect(await listMyTasks()).toEqual({ overdue: [], upcoming: [] });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/me/tasks");
  });
});

describe("my team events feed", () => {
  it("按范围请求 /me/team-events", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ attending: [], invites: [] }),
    );

    const { listMyTeamEvents } = await import("./personal");
    const result = await listMyTeamEvents("2027-03-01T00:00:00Z", "2027-03-08T00:00:00Z");

    expect(result).toEqual({ attending: [], invites: [] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/team-events?from=");
  });
});

describe("agenda api", () => {
  it("请求 /me/agenda 并带 from/to", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ from: "a", to: "b", events: [], tasks: [] }));
    const { listAgenda } = await import("./personal");
    const result = await listAgenda("2026-11-14T00:00:00Z", "2026-11-21T00:00:00Z");
    expect(result.events).toEqual([]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/me/agenda?from=");
  });
});
