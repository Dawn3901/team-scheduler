import { describe, expect, it } from "vitest";
import { calendarDate, calendarUtc, dateRange, localInput, shiftDate, toUtc } from "./dates";

describe("team timezone", () => {
  it("roundtrips 23:30 across month and year boundaries", () => {
    expect(toUtc("2026-12-31T23:30","Asia/Shanghai")).toBe("2026-12-31T15:30:00.000Z");
    expect(localInput("2027-01-01T00:30:00Z","Asia/Shanghai")).toBe("2027-01-01T08:30");
    expect(calendarUtc(calendarDate("2026-12-31T15:30:00Z","Asia/Shanghai"),"Asia/Shanghai")).toBe("2026-12-31T15:30:00.000Z");
  });
  it("handles leap days and exclusive all-day ends", () => {
    expect(shiftDate("2028-02-29",1)).toBe("2028-03-01");
    expect(toUtc("2028-03-01T00:00","Asia/Shanghai")).toBe("2028-02-29T16:00:00.000Z");
    expect(dateRange("2026-11-02","week")).toEqual(["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06","2026-11-07","2026-11-08"]);
  });
  it("respects DST and rejects nonexistent wall time", () => {
    expect(toUtc("2026-07-01T09:00","America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(() => toUtc("2026-03-08T02:30","America/New_York")).toThrow("不存在");
  });
});
