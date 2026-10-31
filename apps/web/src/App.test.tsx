import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TEAM,
  USER,
  authPayload,
  errorResponse,
  jsonResponse,
  mockFetch,
  renderApp,
} from "./test/utils";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("route guard", () => {
  it("redirects visitors without a token to the login page", async () => {
    renderApp(["/app"]);

    expect(await screen.findByRole("heading", { name: "登录同频" })).toBeInTheDocument();
  });

  it("shows local validation errors without calling the API", async () => {
    const fetchMock = mockFetch(() => {
      throw new Error("登录前不应发请求");
    });
    const user = userEvent.setup();
    renderApp(["/login"]);

    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByText("请输入用户名")).toBeInTheDocument();
    expect(screen.getByText("请输入密码")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("logs in, stores the token and lands on team selection", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/login") {
        return jsonResponse(authPayload());
      }
      if (url === "/api/v1/teams?limit=100") {
        return jsonResponse({ items: [TEAM], total: 1 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    renderApp(["/login"]);

    await user.type(screen.getByLabelText("用户名"), "lin");
    await user.type(screen.getByLabelText("密码"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("heading", { name: "我的团队" })).toBeInTheDocument();
    expect(await screen.findByText("软工大作业")).toBeInTheDocument();
    expect(localStorage.getItem("teamsync.token")).toBe("token-1");

    const loginCall = fetchMock.mock.calls.find(([url]) => url === "/api/v1/auth/login");
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({
      username: "lin",
      password: "correct-horse",
    });
  });

  it("shows the backend error and keeps the user on the login page", async () => {
    mockFetch(() => errorResponse(401, "INVALID_CREDENTIALS", "用户名或密码错误"));
    const user = userEvent.setup();
    renderApp(["/login"]);

    await user.type(screen.getByLabelText("用户名"), "lin");
    await user.type(screen.getByLabelText("密码"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("用户名或密码错误");
    expect(screen.getByRole("heading", { name: "登录同频" })).toBeInTheDocument();
    expect(localStorage.getItem("teamsync.token")).toBeNull();
  });
});

describe("register", () => {
  it("registers, stores the token and shows the empty team state", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/register") {
        return jsonResponse(authPayload("token-2"), 201);
      }
      if (url === "/api/v1/teams?limit=100") {
        return jsonResponse({ items: [], total: 0 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const user = userEvent.setup();
    renderApp(["/register"]);

    await user.type(screen.getByLabelText("用户名"), "lin");
    await user.type(screen.getByLabelText("显示名"), "林");
    await user.type(screen.getByLabelText("密码"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "注册并登录" }));

    expect(await screen.findByText("还没有加入任何团队")).toBeInTheDocument();
    expect(localStorage.getItem("teamsync.token")).toBe("token-2");

    const registerCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/v1/auth/register",
    );
    expect(JSON.parse(String(registerCall?.[1]?.body))).toEqual({
      username: "lin",
      display_name: "林",
      password: "correct-horse",
      email: null,
    });
  });

  it("shows a field error for a duplicated username", async () => {
    mockFetch(() => errorResponse(409, "USERNAME_TAKEN", "用户名已被使用"));
    const user = userEvent.setup();
    renderApp(["/register"]);

    await user.type(screen.getByLabelText("用户名"), "lin");
    await user.type(screen.getByLabelText("显示名"), "林");
    await user.type(screen.getByLabelText("密码"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "注册并登录" }));

    expect(await screen.findByText("用户名已被使用")).toBeInTheDocument();
    expect(localStorage.getItem("teamsync.token")).toBeNull();
  });
});

describe("teams", () => {
  it("creates a team and opens its workspace", async () => {
    let teams: (typeof TEAM)[] = [];
    let createBody: unknown = null;
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/v1/auth/me") {
        return jsonResponse(USER);
      }
      if (url === "/api/v1/teams?limit=100") {
        return jsonResponse({ items: teams, total: teams.length });
      }
      if (url === "/api/v1/teams" && init.method === "POST") {
        createBody = JSON.parse(String(init.body));
        teams = [TEAM];
        return jsonResponse(TEAM, 201);
      }
      if (url === "/api/v1/teams/1") {
        return jsonResponse(TEAM);
      }
      throw new Error(`unexpected fetch: ${init.method} ${url}`);
    });
    localStorage.setItem("teamsync.token", "token-1");
    const user = userEvent.setup();
    renderApp(["/app"]);

    expect(await screen.findByText("还没有加入任何团队")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建团队" }));

    const form = screen.getByRole("form", { name: "创建团队表单" });
    await user.type(within(form).getByLabelText("团队名称"), "软工大作业");
    await user.type(within(form).getByLabelText("团队描述"), "6 周项目");
    await user.click(within(form).getByRole("button", { name: "创建团队" }));

    expect(await screen.findByRole("heading", { name: "软工大作业" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "日历" })).toBeInTheDocument();
    expect(createBody).toEqual({ name: "软工大作业", description: "6 周项目" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/teams",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("joins a team with an invite code", async () => {
    let teams: (typeof TEAM)[] = [];
    let joinBody: unknown = null;
    mockFetch((url, init) => {
      if (url === "/api/v1/auth/me") {
        return jsonResponse(USER);
      }
      if (url === "/api/v1/teams?limit=100") {
        return jsonResponse({ items: teams, total: teams.length });
      }
      if (url === "/api/v1/teams/join" && init.method === "POST") {
        joinBody = JSON.parse(String(init.body));
        teams = [{ ...TEAM, my_role: "member", member_count: 2 }];
        return jsonResponse({ ...TEAM, my_role: "member", member_count: 2 });
      }
      if (url === "/api/v1/teams/1") {
        return jsonResponse({ ...TEAM, my_role: "member", member_count: 2 });
      }
      throw new Error(`unexpected fetch: ${init.method} ${url}`);
    });
    localStorage.setItem("teamsync.token", "token-1");
    const user = userEvent.setup();
    renderApp(["/app"]);

    expect(await screen.findByText("还没有加入任何团队")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "用邀请码加入" }));

    const form = screen.getByRole("form", { name: "加入团队表单" });
    await user.type(within(form).getByLabelText("邀请码"), "ab12cd34");
    expect(within(form).getByLabelText("邀请码")).toHaveValue("AB12CD34");
    await user.click(within(form).getByRole("button", { name: "加入团队" }));

    expect(await screen.findByRole("heading", { name: "软工大作业" })).toBeInTheDocument();
    expect(joinBody).toEqual({ invite_code: "AB12CD34" });
  });

  it("shows a friendly error when the team is missing", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") {
        return jsonResponse(USER);
      }
      if (url === "/api/v1/teams/9") {
        return errorResponse(404, "NOT_FOUND", "资源不存在");
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    localStorage.setItem("teamsync.token", "token-1");
    renderApp(["/app/teams/9"]);

    expect(await screen.findByRole("heading", { name: "找不到这个团队" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回团队选择" })).toHaveAttribute("href", "/app");
  });
});

describe("session", () => {
  it("redirects to login when the token is rejected", async () => {
    mockFetch(() => errorResponse(401, "UNAUTHORIZED", "请先登录"));
    localStorage.setItem("teamsync.token", "expired-token");
    renderApp(["/app"]);

    expect(await screen.findByRole("heading", { name: "登录同频" })).toBeInTheDocument();
    await waitFor(() => {
      expect(localStorage.getItem("teamsync.token")).toBeNull();
    });
  });

  it("logs out and returns to the login page", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") {
        return jsonResponse(USER);
      }
      if (url === "/api/v1/teams?limit=100") {
        return jsonResponse({ items: [TEAM], total: 1 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    localStorage.setItem("teamsync.token", "token-1");
    const user = userEvent.setup();
    renderApp(["/app"]);

    expect(await screen.findByText("软工大作业")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "退出" }));

    expect(await screen.findByRole("heading", { name: "登录同频" })).toBeInTheDocument();
    expect(localStorage.getItem("teamsync.token")).toBeNull();
  });
});
