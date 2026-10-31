import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setToken } from "./client";
import { createTeam, getTeam, joinTeam, listTeams } from "./teams";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TEAM = {
  id: 1,
  name: "软工大作业",
  description: "6 周项目",
  invite_code: "AB12CD34",
  owner_id: 1,
  timezone: "Asia/Shanghai",
  my_role: "owner" as const,
  member_count: 1,
};

beforeEach(() => {
  localStorage.clear();
  setToken("token-1");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("teams api", () => {
  it("lists teams with pagination args", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [TEAM], total: 1 }));

    await expect(listTeams()).resolves.toEqual({ items: [TEAM], total: 1 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/teams?limit=100");
    expect(init?.method).toBeUndefined();
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-1");
  });

  it("creates a team with a JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(TEAM, 201));

    await createTeam({ name: "软工大作业", description: "6 周项目" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/teams");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "软工大作业",
      description: "6 周项目",
    });
  });

  it("joins a team with an invite code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...TEAM, my_role: "member" }));

    await joinTeam({ invite_code: "AB12CD34" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/teams/join");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ invite_code: "AB12CD34" });
  });

  it("fetches one team by id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(TEAM));

    await getTeam(1);

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/v1/teams/1");
  });

  it("surfaces a 404 as ApiError", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "NOT_FOUND", message: "资源不存在" }, 404),
    );

    await expect(getTeam(99)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
