import type { ApiErrorBody } from "../types";

const DEFAULT_BASE = "/api/v1";
const TOKEN_KEY = "teamsync.token";

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

/**
 * 统一请求入口：前端不直接拼 API URL，也不直接处理错误体。
 * base 默认 /api/v1；基础设施接口（如 /health）可传空字符串。
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
  base: string = DEFAULT_BASE,
): Promise<T> {
  const token = getToken();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ApiError(
      response.status,
      body.code ?? "UNKNOWN",
      body.message ?? response.statusText,
      body.details,
    );
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
}
