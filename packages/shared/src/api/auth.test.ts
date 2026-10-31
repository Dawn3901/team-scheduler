import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getToken, setToken } from "./client";
import { fetchMe, login, logout, register } from "./auth";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const USER = {
  id: 1,
  username: "lin",
  display_name: "林",
  avatar_color: "#4F46E5",
};

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("login", () => {
  it("posts credentials, persists the token and returns the user", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "token-1", token_type: "bearer", user: USER }),
    );

    const result = await login({ username: "lin", password: "correct-horse" });

    expect(result.user).toEqual(USER);
    expect(getToken()).toBe("token-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      username: "lin",
      password: "correct-horse",
    });
  });

  it("does not persist a token when credentials are rejected", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "INVALID_CREDENTIALS", message: "用户名或密码错误" }, 401),
    );

    await expect(login({ username: "lin", password: "wrong" })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(getToken()).toBeNull();
  });
});

describe("register", () => {
  it("sends the optional email and persists the token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "token-2", token_type: "bearer", user: USER }, 201),
    );

    await register({
      username: "lin",
      display_name: "林",
      password: "correct-horse",
      email: "lin@example.com",
    });

    expect(getToken()).toBe("token-2");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/auth/register");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      username: "lin",
      email: "lin@example.com",
    });
  });
});

describe("session", () => {
  it("fetches the current user with the stored token", async () => {
    setToken("token-3");
    fetchMock.mockResolvedValue(jsonResponse(USER));

    await expect(fetchMe()).resolves.toEqual(USER);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/auth/me");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-3");
  });

  it("clears the token on logout", () => {
    setToken("token-4");

    logout();

    expect(getToken()).toBeNull();
  });
});
