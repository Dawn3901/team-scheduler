import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import TutorialPage from "./TutorialPage";

describe("TutorialPage", () => {
  it("展示上手步骤、颜色语义与开始使用入口", () => {
    render(<MemoryRouter><TutorialPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "5 分钟上手同频" })).toBeInTheDocument();
    expect(screen.getByText("蓝色：需要我参加（含我自己的私密活动）")).toBeInTheDocument();
    expect(screen.getByText("绿色：不需要我参加 / 已拒绝")).toBeInTheDocument();
    expect(screen.getByText("灰色：别人的私密活动（只看到忙碌）")).toBeInTheDocument();
    expect(screen.getByText("红色：已逾期 / 24 小时内")).toBeInTheDocument();
    expect(screen.getByText("黄色：3 天内截止")).toBeInTheDocument();
    expect(screen.getByText("白色：正常 / 已完成")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "开始使用" })).toHaveAttribute("href", "/app");
  });
});
