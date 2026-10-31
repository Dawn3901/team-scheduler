import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getToken, request, setToken, UNAUTHORIZED_EVENT } from "./client";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function abortableFetch(): void {
  fetchMock.mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("token storage", () => {
  it("stores and clears the token", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");

    setToken(null);
    expect(getToken()).toBeNull();
  });
});

describe("request headers", () => {
  it("does not send JSON content-type or auth on a GET without token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok", db: "ok" }));

    await request("/health", {}, { base: "" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/health");
    const headers = new Headers(init?.headers);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("sets JSON content-type for string bodies and sends the bearer token", async () => {
    setToken("token-123");
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "lin", password: "secret" }),
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/auth/login");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });
});

describe("401 handling", () => {
  it("clears the token and emits unauthorized when a token existed", async () => {
    setToken("expired");
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "UNAUTHORIZED", message: "请先登录", details: {} }, 401),
    );

    try {
      await expect(request("/auth/me")).rejects.toMatchObject({
        status: 401,
        code: "UNAUTHORIZED",
      });
      expect(getToken()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    }
  });

  it("does not emit unauthorized when there was no token", async () => {
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "INVALID_CREDENTIALS", message: "用户名或密码错误" }, 401),
    );

    try {
      await expect(
        request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: "lin", password: "wrong" }),
        }),
      ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
      expect(getToken()).toBeNull();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    }
  });
});

describe("transport failures", () => {
  it("maps a timeout to ApiError TIMEOUT", async () => {
    vi.useFakeTimers();
    abortableFetch();

    const promise = request("/slow", {}, { timeoutMs: 50 });
    const assertion = expect(promise).rejects.toMatchObject({
      status: 0,
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("maps an external abort to ApiError ABORTED", async () => {
    abortableFetch();
    const controller = new AbortController();

    const promise = request("/slow", { signal: controller.signal });
    const assertion = expect(promise).rejects.toMatchObject({
      status: 0,
      code: "ABORTED",
    });
    controller.abort();
    await assertion;
  });

  it("maps a fetch rejection to ApiError NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(request("/health", {}, { base: "" })).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
  });
});

describe("response handling", () => {
  it("returns undefined for 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(request("/auth/me", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
