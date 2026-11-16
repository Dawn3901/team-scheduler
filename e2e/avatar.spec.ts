import { expect, test, type Page } from "@playwright/test";

/** 1×1 透明 PNG，用于真实走一次 multipart 上传链路。 */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function register(page: Page): Promise<void> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`e2e_avatar_${suffix}`);
  await page.getByLabel("显示名").fill("头像用户");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

test("上传头像后侧栏与个人资料显示图片，移除后回退首字母", async ({ page }) => {
  await register(page);
  await page.getByRole("link", { name: "个人资料" }).click();
  await expect(page.getByRole("heading", { name: "个人资料" })).toBeVisible();

  await page.getByLabel("选择头像图片").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });

  // 资料卡与侧栏都换成 <img>，地址带版本号。
  const avatar = page.locator("img.profile-avatar");
  await expect(avatar).toBeVisible();
  const src = await avatar.getAttribute("src");
  expect(src).toMatch(/\/api\/v1\/users\/\d+\/avatar\/\d+$/);
  await expect(page.locator(".app-sidebar img.avatar")).toHaveAttribute("src", src!);

  // 图片本身可以被未登录请求取到（用户确认允许）。
  const anonymous = await page.request.get(src!);
  expect(anonymous.status()).toBe(200);
  expect(anonymous.headers()["content-type"]).toBe("image/png");

  // 成员页同样显示上传的头像。
  await expect(page.getByRole("button", { name: "移除头像" })).toBeVisible();
  await page.getByRole("link", { name: "个人资料" }).click();

  await page.getByRole("button", { name: "移除头像" }).click();
  await expect(page.locator("img.profile-avatar")).toHaveCount(0);
  await expect(page.locator(".profile-card .profile-avatar")).toHaveText("头");
  await expect(page.getByRole("button", { name: "上传头像" })).toBeVisible();
});

test("非图片文件在前端即时提示，不上传", async ({ page }) => {
  await register(page);
  await page.getByRole("link", { name: "个人资料" }).click();

  await page.getByLabel("选择头像图片").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });

  await expect(page.getByRole("alert")).toHaveText("头像只支持 JPG、PNG 或 WebP 图片");
  await expect(page.locator("img.profile-avatar")).toHaveCount(0);
});
