import type { HealthStatus } from "../types";
import { request } from "./client";

export function fetchHealth(): Promise<HealthStatus> {
  // 健康检查不能把占位页卡在“检查中…”：4 秒超时，由页面提供重试。
  return request<HealthStatus>("/health", {}, { base: "", timeoutMs: 4_000 });
}
