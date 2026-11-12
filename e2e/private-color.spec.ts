import { expect, test, type Page } from "@playwright/test";

test("自己创建的私密活动按个人活动着色，不是灰色，也不叠加忙碌斜纹", async ({ page }) => {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`private_${suffix}`);
  await page.getByLabel("显示名").fill("私密测试");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();

  await page.getByRole("button", { name: "创建团队" }).click();
  await page.getByLabel("团队名称").fill(`私密团队${suffix}`);
  await page.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "新建活动", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建活动" });
  await dialog.getByLabel("活动标题").fill("线上买药");
  await dialog.getByLabel("可见性").selectOption("private");
  await dialog.getByRole("button", { name: "保存活动" }).click();

  const item = page.locator(".timeline-event", { hasText: "线上买药" }).first();
  await expect(item).toBeVisible();
  // 蓝色 #2563eb；灰色私密是 #6b7280。
  const left = await item.evaluate((element) => getComputedStyle(element).borderLeftColor);
  expect(left.replace(/\s/g, "")).toBe("rgb(37,99,235)");

  // 自己的活动已经以可点事件显示，忙闲层不应再叠一层灰色斜纹。
  await page.locator(".calendar-filterbar select").first().selectOption({ label: "仅我 / 我的活动" });
  await page.waitForTimeout(800);
  const busyOverlays = page.locator(".timeline-busy-block");
  expect(await busyOverlays.count()).toBe(0);
});
