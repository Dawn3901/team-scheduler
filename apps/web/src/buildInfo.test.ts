import { describe, expect, it } from "vitest";

import { buildInfo, formatBuildTime } from "./buildInfo";

describe("buildInfo", () => {
  it("读取构建期注入的版本、提交与时间", () => {
    expect(buildInfo.version).toBe("0.1.0-test");
    expect(buildInfo.commit).toBe("testcommit");
    expect(buildInfo.buildTime).toBe("2026-11-12T00:00:00.000Z");
  });

  it("构建时间按本地时间格式化，未知值原样返回", () => {
    expect(formatBuildTime("2026-11-12T00:00:00.000Z")).not.toBe("2026-11-12T00:00:00.000Z");
    expect(formatBuildTime("未知")).toBe("未知");
  });
});
