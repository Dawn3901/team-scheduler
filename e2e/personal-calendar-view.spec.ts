import { expect, test } from "@playwright/test";

test("个人日历：视图切换、空日历、面包屑", async ({ page }) => {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`pcal_${suffix}`);
  await page.getByLabel("显示名").fill("个人日历");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await page.getByRole("button", { name: "创建团队" }).click();
  await page.getByLabel("团队名称").fill(`个人日历${suffix}`);
  await page.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "我的日程" }).click();
  await expect(page.getByRole("heading", { name: "我的日程" })).toBeVisible();

  // 3) 面包屑：个人空间 > 我的日程
  const breadcrumb = page.locator(".breadcrumb");
  await expect(breadcrumb).toContainText("个人空间");
  await expect(breadcrumb).toContainText("我的日程");
  await expect(breadcrumb).not.toContainText("团队日历");

  // 1) 月视图只有一个“今天”，没有重复工具栏
  await page.getByRole("button", { name: "月", exact: true }).click();
  await expect(page.locator(".rbc-month-view")).toBeVisible();
  await expect(page.locator(".rbc-toolbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "今天", exact: true })).toHaveCount(1);

  // 2) 翻到没有安排的月份仍显示日历，不是一行提示
  await page.getByRole("button", { name: "下一页" }).click();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.locator(".rbc-month-view")).toBeVisible();
  await expect(page.getByText("这段时间没有安排")).toHaveCount(0);

  // 任务清单视图存在，且没有“日”视图
  await page.getByRole("button", { name: "任务清单" }).click();
  await expect(page.getByText("暂无任务")).toBeVisible();
  await expect(page.getByRole("button", { name: "日", exact: true })).toHaveCount(0);
});
