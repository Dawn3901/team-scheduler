import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import TutorialPrompt from "./TutorialPrompt";

describe("TutorialPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("首次进入时提示，点击不再提示后隐藏并记录", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TutorialPrompt /></MemoryRouter>);

    expect(screen.getByRole("status", { name: "新手教程提示" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "不再提示" }));

    expect(screen.queryByRole("status", { name: "新手教程提示" })).not.toBeInTheDocument();
    expect(localStorage.getItem("teamsync.tutorial.seen")).toBe("1");
  });

  it("已看过教程后不再提示", () => {
    localStorage.setItem("teamsync.tutorial.seen", "1");
    render(<MemoryRouter><TutorialPrompt /></MemoryRouter>);
    expect(screen.queryByRole("status", { name: "新手教程提示" })).not.toBeInTheDocument();
  });
});
