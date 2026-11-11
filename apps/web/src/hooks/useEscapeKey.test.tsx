import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEscapeKey } from "./useEscapeKey";

describe("useEscapeKey", () => {
  it("按 Esc 调用关闭回调", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("enabled=false 时不响应 Esc", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(false, onEscape));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("其他按键不触发", () => {
    const onEscape = vi.fn();
    renderHook(() => useEscapeKey(true, onEscape));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
