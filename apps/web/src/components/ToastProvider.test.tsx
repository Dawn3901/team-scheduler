import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ToastProvider } from "./ToastProvider";
import { useToast } from "../lib/toast";

function Trigger() {
  const { notify } = useToast();
  return (
    <>
      <button type="button" onClick={() => notify("没有权限执行这个操作", { tone: "error" })}>
        触发错误
      </button>
      <button type="button" onClick={() => notify("已保存", { tone: "success" })}>
        触发成功
      </button>
    </>
  );
}

function renderToast() {
  return render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  it("shows an error toast and closes it", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "触发错误" }));
    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("没有权限执行这个操作");

    await user.click(screen.getByRole("button", { name: "关闭提示" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses status role for non-error toasts", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "触发成功" }));
    expect(await screen.findByRole("status")).toHaveTextContent("已保存");
  });
});
