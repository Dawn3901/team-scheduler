import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type ToastTone = "error" | "info" | "success";

export interface ToastOptions {
  tone?: ToastTone;
  duration?: number;
}

export interface ToastContextValue {
  notify: (message: ReactNode, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }
  return value;
}
