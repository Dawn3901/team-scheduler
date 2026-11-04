import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@teamsync/shared";
import { describe, expect, it } from "vitest";

import { ToastProvider } from "../components/ToastProvider";
import { useAction } from "./useWork";

function Harness({ error }: { error: ApiError }) {
  const action = useAction();
  return (
    <button
      type="button"
      onClick={() => {
        void action.run(() => Promise.reject(error)).catch(() => {});
      }}
    >
      执行
    </button>
  );
}

const cases: Array<[string, ApiError, string]> = [
  ["403", new ApiError(403, "FORBIDDEN", "没有权限"), "没有权限执行这个操作"],
  [
    "409",
    new ApiError(409, "TIME_CONFLICT", "所选成员已有安排"),
    "所选成员已有安排",
  ],
  [
    "422",
    new ApiError(422, "UNPROCESSABLE_ENTITY", "结束时间必须晚于开始时间"),
    "结束时间必须晚于开始时间",
  ],
];

describe("useAction", () => {
  it.each(cases)("shows a unified toast for %s errors", async (_label, error, expected) => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Harness error={error} />
        </ToastProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "执行" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  });
});
