import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { CalendarToolbar } from "./CalendarPage";

describe("CalendarToolbar", () => {
  it("keeps calendar navigation and view switching accessible", async () => {
    const onNavigate = vi.fn();
    const onView = vi.fn();
    const props = { label: "2026年11月", view: "month", onNavigate, onView } as ComponentProps<typeof CalendarToolbar>;
    const user = userEvent.setup();
    const { rerender } = render(<CalendarToolbar {...props} />);

    expect(screen.getByRole("heading", { name: "2026年11月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "上一页" }));
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await user.click(screen.getByRole("button", { name: "今天" }));
    expect(onNavigate.mock.calls).toEqual([["PREV"], ["NEXT"], ["TODAY"]]);

    await user.click(screen.getByRole("button", { name: "周" }));
    await user.click(screen.getByRole("button", { name: "日" }));
    expect(onView.mock.calls).toEqual([["week"], ["day"]]);
    rerender(<CalendarToolbar {...props} view="week" />);
    expect(screen.getByRole("button", { name: "周" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "月" })).toHaveAttribute("aria-pressed", "false");
  });
});
