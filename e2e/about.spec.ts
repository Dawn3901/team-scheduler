import { expect, test, type Page } from "@playwright/test";

async function register(page: Page): Promise<void> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`e2e_about_${suffix}`);
  await page.getByLabel("显示名").fill("E2E About");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

test("侧栏“关于”展示项目介绍与边界", async ({ page }) => {
  await register(page);

  await page.getByRole("link", { name: "关于" }).click();
  await expect(page.getByRole("heading", { name: "关于同频" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "共享日历" })).toBeVisible();
  await expect(page.getByText("蓝：需要我参加")).toBeVisible();
  await expect(page.getByText("不做 IM、视频会议、附件、评论、多日历。")).toBeVisible();
  await expect(page.getByRole("link", { name: "去看新手教程" })).toBeVisible();
  // 版本与构建信息：来自构建期注入，不是运行时猜测。
  await expect(page.getByRole("heading", { name: "版本与构建" })).toBeVisible();
  await expect(page.getByTestId("app-version")).toHaveText(/^\d+\.\d+\.\d+/);
});
