import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ToastContext, type ToastOptions, type ToastTone } from "../lib/toast";

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: ReactNode, options: ToastOptions = {}) => {
      const id = nextId.current;
      nextId.current += 1;
      const tone = options.tone ?? "error";
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { id, message, tone }]);
      const timer = setTimeout(() => dismiss(id), options.duration ?? DEFAULT_DURATION_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) {
        clearTimeout(timer);
      }
      active.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <div className="toast-message">{toast.message}</div>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="关闭提示">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
