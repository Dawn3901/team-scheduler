import type { MyTeamEvent } from "@teamsync/shared";
import { describe, expect, it } from "vitest";

import { isAlsoInTeam, normalizeIso } from "./calendarDedupe";

const teamEvent = (overrides: Partial<MyTeamEvent> = {}): MyTeamEvent => ({
  id: 12,
  team_id: 1,
  team_name: "软工大作业",
  title: "测试活动",
  start_at: "2026-11-12T06:00:00Z",
  end_at: "2026-11-12T08:00:00Z",
  all_day: false,
  location: null,
  visibility: "private",
  my_response: "accepted",
  needs_confirmation: false,
  local_date: "2026-11-12",
  start_key: "2026-11-12T06:00:00Z",
  end_key: "2026-11-12T08:00:00Z",
  ...overrides,
});

const personal = { title: "测试活动", start_at: "2026-11-12T06:00:00Z", end_at: "2026-11-12T08:00:00Z" };

describe("normalizeIso", () => {
  it("去掉微秒与 +00:00 后缀", () => {
    expect(normalizeIso("2026-11-12T06:00:00.123456Z")).toBe("2026-11-12T06:00:00Z");
    expect(normalizeIso("2026-11-12T06:00:00+00:00")).toBe("2026-11-12T06:00:00Z");
    expect(normalizeIso("")).toBe("");
  });
});

describe("isAlsoInTeam", () => {
  it("同标题同时间（含微秒差异）视为已出现在团队活动里", () => {
    expect(isAlsoInTeam(personal, [teamEvent()])).toBe(true);
    expect(
      isAlsoInTeam({ ...personal, start_at: "2026-11-12T06:00:00.500000Z" }, [teamEvent()]),
    ).toBe(true);
  });

  it("时间或标题不同则视为独立个人事件", () => {
    expect(isAlsoInTeam({ ...personal, title: "私人事务" }, [teamEvent()])).toBe(false);
    expect(
      isAlsoInTeam({ ...personal, start_at: "2026-11-12T07:00:00Z", end_at: "2026-11-12T09:00:00Z" }, [
        teamEvent(),
      ]),
    ).toBe(false);
    expect(isAlsoInTeam(personal, [])).toBe(false);
  });
});
