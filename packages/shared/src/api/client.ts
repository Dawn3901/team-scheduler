import type { ApiErrorBody } from "../types";

const DEFAULT_BASE = "/api/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const TOKEN_KEY = "teamsync.token";

/** 401 时派发；路由层（W1-07）监听后清空登录态并跳登录页。 */
export const UNAUTHORIZED_EVENT = "teamsync:unauthorized";

export interface RequestOptions {
  base?: string;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (timedOut) {
      throw new ApiError(0, "TIMEOUT", "请求超时，请重试");
    }
    if (controller.signal.aborted) {
      throw new ApiError(0, "ABORTED", "请求已取消");
    }
    throw new ApiError(0, "NETWORK_ERROR", "网络请求失败，请检查后端是否启动");
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

function notifyUnauthorized(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
}

/**
 * 统一请求入口：前端不直接拼 API URL，也不直接处理错误体。
 * base 默认 /api/v1；基础设施接口（如 /health）传 { base: "" }。
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const { base = DEFAULT_BASE, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const hadToken = getToken() !== null;
  const response = await fetchWithTimeout(
    `${base}${path}`,
    { ...init, headers: buildHeaders(init) },
    timeoutMs,
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    if (response.status === 401) {
      setToken(null);
      if (hadToken) {
        notifyUnauthorized();
      }
    }
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN",
      body.message ?? response.statusText,
      body.details,
    );
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
}
