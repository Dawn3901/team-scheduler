import type { HealthStatus } from "../types";
import { request } from "./client";

export function fetchHealth(): Promise<HealthStatus> {
  return request<HealthStatus>("/health", {}, "");
}
