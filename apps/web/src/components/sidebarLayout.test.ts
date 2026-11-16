import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 回归：团队日历下侧栏条目较多时，滚动容器必须落在深色侧栏上，
 * 不能溢出到 .app-shell 的白底（用户 2026-11-16 反馈截图）。
 * happy-dom 不做排版，这里直接校验样式声明，Playwright 再做真实截图回归。
 */
const css = readFileSync(resolve(process.cwd(), "src/demo-parity.css"), "utf8");
const aiCss = readFileSync(resolve(process.cwd(), "src/components/AiAssistant.css"), "utf8");

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start, `缺少样式规则 ${selector}`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("}", start));
}

const rule = (selector: string) => block(css, selector);

describe("侧栏滚动与层级", () => {
  it("侧栏限高并内部滚动，不溢出到白底", () => {
    const sidebar = rule(".app-sidebar");
    expect(sidebar).toMatch(/max-height:\s*100d?vh/);
    expect(sidebar).toMatch(/overflow-y:\s*auto/);
    expect(sidebar).toMatch(/overscroll-behavior:\s*contain/);
  });

  it("主体区允许收缩，内容区自行滚动", () => {
    expect(rule(".app-body")).toMatch(/min-height:\s*0/);
  });

  it("底部用户区在滚动时保持可见", () => {
    expect(rule(".sidebar-user")).toMatch(/position:\s*sticky/);
  });

  it("AI 助手不与侧栏重叠", () => {
    // 助手按视口定位，层级高于侧栏；夹紧逻辑保证不出视口，也不压住导航。
    const widget = block(aiCss, ".ai-widget");
    expect(widget).toMatch(/position:\s*fixed/);
    expect(Number(/z-index:\s*(\d+)/.exec(widget)?.[1])).toBeGreaterThan(Number(/z-index:\s*(\d+)/.exec(rule(".app-sidebar"))?.[1]));
  });
});
