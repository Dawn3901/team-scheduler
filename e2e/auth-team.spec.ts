import { expect, test, type Page } from "@playwright/test";

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function register(page: Page, username: string, displayName: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("显示名").fill(displayName);
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

test("注册 → 建队 → 退出 → 新用户凭邀请码加入", async ({ browser }) => {
  const suffix = uniqueSuffix();
  const ownerName = `e2e_owner_${suffix}`;
  const guestName = `e2e_guest_${suffix}`;
  const teamName = `E2E 验收队 ${suffix}`;

  // 用户 A：注册 → 建队 → 复制邀请码 → 退出
  const owner = await browser.newPage();
  await register(owner, ownerName, "E2E Owner");
  await expect(owner.getByText("还没有加入任何团队")).toBeVisible();

  await owner.getByRole("button", { name: "创建团队" }).click();
  const createForm = owner.getByRole("form", { name: "创建团队表单" });
  await createForm.getByLabel("团队名称").fill(teamName);
  await createForm.getByLabel("团队描述").fill("Playwright E2E");
  await createForm.getByRole("button", { name: "创建团队" }).click();

  await expect(owner.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(owner.getByRole("heading", { name: "日历" })).toBeVisible();
  const inviteCode = (await owner.locator(".invite-code").textContent())?.trim() ?? "";
  expect(inviteCode).toMatch(/^[A-Z0-9]{8}$/);

  await owner.getByRole("button", { name: "退出" }).click();
  await expect(owner.getByRole("heading", { name: "登录同频" })).toBeVisible();

  // 用户 B：注册 → 用邀请码加入 → 看到成员身份和 2 人团队
  const guest = await browser.newPage();
  await register(guest, guestName, "E2E Guest");
  await expect(guest.getByText("还没有加入任何团队")).toBeVisible();
  await guest.getByRole("button", { name: "用邀请码加入" }).click();
  const joinForm = guest.getByRole("form", { name: "加入团队表单" });
  await joinForm.getByLabel("邀请码").fill(inviteCode);
  await joinForm.getByRole("button", { name: "加入团队" }).click();

  await expect(guest.getByRole("heading", { name: teamName })).toBeVisible();
  await expect(guest.getByText(/团队空间 · 2 位成员/)).toBeVisible();
  await expect(guest.locator(".badge-member")).toHaveText("成员");
});

test("错误邀请码给出明确提示", async ({ page }) => {
  const suffix = uniqueSuffix();

  await register(page, `e2e_join_${suffix}`, "E2E Join");
  await page.getByRole("button", { name: "用邀请码加入" }).click();

  const joinForm = page.getByRole("form", { name: "加入团队表单" });
  await joinForm.getByLabel("邀请码").fill("ZZZZZZZZ");
  await joinForm.getByRole("button", { name: "加入团队" }).click();

  await expect(page.getByRole("alert")).toHaveText("邀请码无效或已失效");
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
});
