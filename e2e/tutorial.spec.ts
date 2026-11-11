import { expect, test, type Page } from "@playwright/test";

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function register(page: Page): Promise<void> {
  const suffix = uniqueSuffix();
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`e2e_tutorial_${suffix}`);
  await page.getByLabel("显示名").fill("E2E Tutorial");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

test("首次登录展示新手教程，进入后不再提示", async ({ page }) => {
  await register(page);

  const prompt = page.getByRole("status", { name: "新手教程提示" });
  await expect(prompt).toBeVisible();
  await page.getByRole("link", { name: "开始教程" }).click();

  await expect(page.getByRole("heading", { name: "5 分钟上手同频" })).toBeVisible();
  await expect(page.getByText("蓝色：需要我参加")).toBeVisible();
  await expect(page.getByText("红色：已逾期 / 24 小时内")).toBeVisible();

  await page.getByRole("link", { name: "开始使用" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
  await expect(page.getByRole("status", { name: "新手教程提示" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
  await expect(page.getByRole("status", { name: "新手教程提示" })).toHaveCount(0);
});
