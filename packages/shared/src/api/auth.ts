import type { UserSummary } from "../types";
import { request, setToken } from "./client";

export interface RegisterPayload {
  username: string;
  display_name: string;
  password: string;
  email?: string | null;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthResult {
  access_token: string;
  token_type: "bearer";
  user: UserSummary;
}

async function authenticate(path: string, payload: object): Promise<AuthResult> {
  const result = await request<AuthResult>(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  // 登录/注册成功即持久化 token，页面不用再关心存储细节。
  setToken(result.access_token);
  return result;
}

export function register(payload: RegisterPayload): Promise<AuthResult> {
  return authenticate("/auth/register", payload);
}

export function login(payload: LoginPayload): Promise<AuthResult> {
  return authenticate("/auth/login", payload);
}

export function fetchMe(): Promise<UserSummary> {
  return request<UserSummary>("/auth/me");
}

export function logout(): void {
  setToken(null);
}
