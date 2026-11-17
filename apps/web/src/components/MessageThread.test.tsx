import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessageThread } from "./MessageThread";
import { cleanupApp, jsonResponse } from "../test/utils";

const MEMBERS = [
  { user_id: 1, display_name: "林" },
  { user_id: 2, display_name: "陈" },
];

const MESSAGE = {
  id: 7,
  target_type: "task" as const,
  target_id: 5,
  kind: "comment" as const,
  body: "地点定在 3F",
  author: { user_id: 2, display_name: "陈", avatar_url: null },
  mention_user_ids: [],
  created_at: "2026-11-17T02:00:00Z",
};

function renderThread(props: Partial<Parameters<typeof MessageThread>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MessageThread target="task" targetId={5} teamId={1} members={MEMBERS} currentUserId={1} {...props} />
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  await cleanupApp();
  vi.unstubAllGlobals();
});

describe("对象内讨论（CR-016）", () => {
  it("加载并展示消息、作者与时间", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(jsonResponse({ items: [MESSAGE], has_more: false, next_before_id: null })),
    ));
    renderThread();

    expect(await screen.findByText("地点定在 3F")).toBeInTheDocument();
    // 作者名在消息里，@ 按钮里也有“陈”，用 scope 限定。
    const list = screen.getByRole("list");
    expect(list).toHaveTextContent("陈");
    expect(screen.getByRole("region", { name: "讨论" })).toBeInTheDocument();
  });

  it("发送消息时只带选中的 @ 成员，并在成功后清空输入", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ ...MESSAGE, id: 8, body: "看下这个" }, 201));
      }
      return Promise.resolve(jsonResponse({ items: [MESSAGE], has_more: false, next_before_id: null }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderThread();

    await screen.findByText("地点定在 3F");
    await user.click(screen.getByRole("button", { name: "@陈" }));
    fireEvent.change(screen.getByLabelText("讨论内容"), { target: { value: "看下这个" } });
    await user.click(screen.getByRole("button", { name: "发送到讨论" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post![1]!.body))).toEqual({
        body: "看下这个",
        kind: "comment",
        mention_user_ids: [2],
      });
    });
    await waitFor(() => expect(screen.getByLabelText("讨论内容")).toHaveValue(""));
  });

  it("任务讨论支持选择“受阻原因”，活动讨论不提供该类型", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(jsonResponse({ items: [], has_more: false, next_before_id: null })),
    ));
    const { unmount } = renderThread();
    const select = await screen.findByLabelText("消息类型");
    expect(select).toContainHTML("受阻原因");
    unmount();

    renderThread({ target: "event" });
    const eventSelect = await screen.findByLabelText("消息类型");
    expect(eventSelect).not.toContainHTML("受阻原因");
  });

  it("没有消息时给出引导文案", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(jsonResponse({ items: [], has_more: false, next_before_id: null })),
    ));
    renderThread();
    expect(await screen.findByText(/还没有讨论/)).toBeInTheDocument();
  });
});
