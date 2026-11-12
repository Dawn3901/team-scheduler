import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import AboutPage from "./AboutPage";

describe("AboutPage", () => {
  it("介绍产品定位、核心功能、颜色与边界", () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "关于同频" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "让小组的时间先“同频”" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "共享日历" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "邀请与 RSVP" })).toBeInTheDocument();
    expect(screen.getByText("蓝：需要我参加")).toBeInTheDocument();
    expect(screen.getByText("红：逾期 / 24 小时内")).toBeInTheDocument();
    expect(screen.getByText("不做 IM、视频会议、附件、评论、多日历。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去看新手教程" })).toHaveAttribute("href", "/app/tutorial");
  });
});
