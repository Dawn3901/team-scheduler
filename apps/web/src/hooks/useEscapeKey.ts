import { useEffect } from "react";

/**
 * 按 Esc 关闭当前弹窗。
 * - enabled=false 时不监听，保存中/无弹窗时不会误触发；
 * - 回调变化时重新绑定，避免闭包拿到旧状态。
 */
export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onEscape();
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [enabled, onEscape]);
}
