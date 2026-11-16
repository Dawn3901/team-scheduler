import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { USER, cleanupApp, jsonResponse, mockFetch, overrideDefaults, renderApp } from "../test/utils";

const AVATAR_URL = `/api/v1/users/${USER.id}/avatar/1794842251882`;

beforeEach(() => {
  vi.stubGlobal("WebSocket", undefined);
  localStorage.clear();
  localStorage.setItem("teamsync.token", "token-1");
  localStorage.setItem("teamsync.tutorial.seen", "1");
});

afterEach(async () => {
  await cleanupApp();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function pngFile(name = "me.png") {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

describe("个人资料 · 上传头像（AUTH-8）", () => {
  it("上传成功后显示图片头像，并调用 multipart 上传接口", async () => {
    overrideDefaults("me");
    let uploaded = false;
    const fetchMock = mockFetch((url, init) => {
      if (url === "/api/v1/auth/me") {
        return jsonResponse({ ...USER, avatar_url: uploaded ? AVATAR_URL : null });
      }
      if (url === "/api/v1/auth/me/avatar" && init.method === "POST") {
        expect(init.body).toBeInstanceOf(FormData);
        uploaded = true;
        return jsonResponse({ ...USER, avatar_url: AVATAR_URL });
      }
      return jsonResponse({ items: [], total: 0 });
    });
    renderApp(["/app/profile"]);

    const picker = await screen.findByLabelText("选择头像图片");
    fireEvent.change(picker, { target: { files: [pngFile()] } });

    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/v1/auth/me/avatar" && init?.method === "POST")).toBe(true);
    // 重新拉取资料后，头像同时出现在侧栏/顶栏（class 为 avatar）与资料卡（profile-avatar）。
    await waitFor(() => {
      expect(document.querySelector(`img.profile-avatar[src="${AVATAR_URL}"]`)).not.toBeNull();
    });
    expect(document.querySelectorAll(`img[src="${AVATAR_URL}"]`).length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "更换头像" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除头像" })).toBeInTheDocument();
  });

  it("不支持的类型在前端直接提示，不发请求", async () => {
    const fetchMock = mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse(USER);
      return jsonResponse({ items: [], total: 0 });
    });
    renderApp(["/app/profile"]);

    const picker = await screen.findByLabelText("选择头像图片");
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", { type: "image/gif" });
    fireEvent.change(picker, { target: { files: [gif] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("头像只支持 JPG、PNG 或 WebP 图片");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/avatar"))).toBe(false);
  });

  it("图片加载失败时自动回退为首字母", async () => {
    mockFetch((url) => {
      if (url === "/api/v1/auth/me") return jsonResponse({ ...USER, avatar_url: AVATAR_URL });
      return jsonResponse({ items: [], total: 0 });
    });

    renderApp(["/app/profile"]);

    const image = await waitFor(() => {
      const node = document.querySelector<HTMLImageElement>(`img.profile-avatar[src="${AVATAR_URL}"]`);
      expect(node).not.toBeNull();
      return node!;
    });
    fireEvent.error(image);

    // 回退后不再渲染 img，而是显示首字母并保留用户底色。
    await waitFor(() => expect(document.querySelector(`img.profile-avatar[src="${AVATAR_URL}"]`)).toBeNull());
    const fallback = document.querySelector(".profile-avatar:not(img)");
    expect(fallback).not.toBeNull();
    expect(fallback).toHaveTextContent("林");
  });
});
