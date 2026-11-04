import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): ReactNode {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders a fallback instead of a blank page", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      expect(screen.getByRole("heading", { name: "页面出错了" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
