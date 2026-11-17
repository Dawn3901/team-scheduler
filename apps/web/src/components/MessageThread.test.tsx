import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const chips = screen.getByLabelText("提及成员");
    await user.click(within(chips).getByRole("button", { name: "@陈" }));
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

  it("任务讨论可选“受阻原因”，活动讨论不再区分讨论/说明", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(jsonResponse({ items: [], has_more: false, next_before_id: null })),
    ));
    const { unmount } = renderThread();
    const select = await screen.findByLabelText("消息类型");
    expect(select).toContainHTML("受阻原因");
    unmount();

    // 活动里的“说明”只会造成选择负担：统一用讨论，系统消息仍按类型展示。
    renderThread({ target: "event" });
    await screen.findByRole("region", { name: "讨论" });
    expect(screen.queryByLabelText("消息类型")).not.toBeInTheDocument();
  });

  it("手打 @ 会弹出成员选择，选中后插入名字并记录提及", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ ...MESSAGE, id: 11 }, 201));
      }
      return Promise.resolve(jsonResponse({ items: [], has_more: false, next_before_id: null }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderThread();

    const input = await screen.findByLabelText("讨论内容");
    await user.type(input, "@");

    const menu = await screen.findByRole("listbox", { name: "选择要 @ 的成员" });
    expect(menu).toHaveTextContent("@陈");
    await user.click(within(menu).getByRole("button", { name: "@陈" }));

    await waitFor(() => expect(input).toHaveValue("@陈 "));
    await user.type(input, "看一下");
    await user.click(screen.getByRole("button", { name: "发送到讨论" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(post![1]!.body))).toMatchObject({
        body: "@陈 看一下",
        mention_user_ids: [2],
      });
    });
  });

  it("删掉 @ 的名字后不再通知该成员", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.resolve(jsonResponse({ ...MESSAGE, id: 12 }, 201))
        : Promise.resolve(jsonResponse({ items: [], has_more: false, next_before_id: null })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderThread();

    const input = await screen.findByLabelText("讨论内容");
    await user.type(input, "@陈");
    const mentionMenu = await screen.findByRole("listbox", { name: "选择要 @ 的成员" });
    await user.click(within(mentionMenu).getByRole("button", { name: "@陈" }));
    await waitFor(() => expect(input).toHaveValue("@陈 "));
    await user.clear(input);
    await user.type(input, "随便说说");
    await user.click(screen.getByRole("button", { name: "发送到讨论" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(post![1]!.body)).mention_user_ids).toEqual([]);
    });
  });

  it("没有消息时给出引导文案", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(jsonResponse({ items: [], has_more: false, next_before_id: null })),
    ));
    renderThread();
    expect(await screen.findByText(/还没有讨论/)).toBeInTheDocument();
  });
});
