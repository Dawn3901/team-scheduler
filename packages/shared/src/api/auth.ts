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

/** AUTH-8：上传自己的头像（multipart，字段名 file）。 */
export function uploadAvatar(file: Blob): Promise<UserSummary> {
  const body = new FormData();
  body.append("file", file);
  // 不手动设置 Content-Type：让浏览器带上 multipart 边界。
  return request<UserSummary>("/auth/me/avatar", { method: "POST", body }, { timeoutMs: 30_000 });
}

/** AUTH-8：删除自己的头像，回退为首字母 + 头像颜色。 */
export function deleteAvatar(): Promise<UserSummary> {
  return request<UserSummary>("/auth/me/avatar", { method: "DELETE" });
}
