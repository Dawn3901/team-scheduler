import { expect, test, type Page } from "@playwright/test";

async function setupOwner(page: Page) {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const teamName = `个人日历团队${suffix}`;
  await page.goto("/register");
  await page.evaluate(() => sessionStorage.clear());
  await page.getByLabel("用户名").fill(`personal_${suffix}`);
  await page.getByLabel("显示名").fill("个人日历");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await page.getByRole("button", { name: "创建团队" }).click();
  await page.getByLabel("团队名称").fill(teamName);
  await page.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();
  const teamId = new URL(page.url()).pathname.match(/teams\/(\d+)/)?.[1] ?? "";
  return {
    inviteCode: (await page.locator(".invite-code").textContent())!.trim(),
    teamName,
    teamId,
  };
}

test("个人日程可增删改，并在团队忙闲中只显示忙碌", async ({ browser }) => {
  const owner = await browser.newPage();
  const { inviteCode, teamId } = await setupOwner(owner);

  await owner.getByRole("link", { name: "我的日程" }).click();
  await expect(owner.getByRole("heading", { name: "我的日程" })).toBeVisible();
  await owner.getByRole("button", { name: /新建个人事件|新建第一条/ }).first().click();

  const dialog = owner.getByRole("dialog", { name: "新建个人事件" });
  await dialog.getByRole("textbox", { name: "标题" }).fill("个人面试");
  await dialog.getByRole("textbox", { name: "地点" }).fill("线上");
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  const startLocal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}T14:00`;
  const endLocal = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}T15:00`;
  await dialog.getByLabel("开始时间", { exact: true }).fill(startLocal);
  await dialog.getByLabel("结束时间", { exact: true }).fill(endLocal);
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(owner.getByText("个人面试")).toBeVisible();
  await expect(owner.getByText(/参与团队忙闲/).first()).toBeVisible();

  // CR-011：团队里自己参与的活动以只读方式并入“我的日程”。
  await owner.goto(`/app/teams/${teamId}/calendar`);
  await expect(owner.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();
  await owner.getByRole("button", { name: "新建活动", exact: true }).click();
  const eventDialog = owner.getByRole("dialog", { name: "新建活动" });
  await eventDialog.getByLabel("活动标题").fill("团队周会");
  await eventDialog.getByRole("button", { name: "保存活动" }).click();
  await owner.getByRole("link", { name: "我的日程" }).click();
  await expect(owner.getByText("团队周会")).toBeVisible();

  const mate = await browser.newPage();
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await mate.goto("/register");
  await mate.getByLabel("用户名").fill(`mate_${suffix}`);
  await mate.getByLabel("显示名").fill("队友");
  await mate.getByLabel("密码").fill("e2e-correct-horse");
  await mate.getByRole("button", { name: "注册并登录" }).click();
  await mate.getByRole("button", { name: "用邀请码加入" }).click();
  const join = mate.getByRole("form", { name: "加入团队表单" });
  await join.getByLabel("邀请码").fill(inviteCode);
  await join.getByRole("button", { name: "加入团队" }).click();
  await expect(mate.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();

  const availability = await mate.evaluate(async () => {
    const token = localStorage.getItem("teamsync.token");
    const teams = await (await fetch("/api/v1/teams?limit=100", { headers: { Authorization: `Bearer ${token}` } })).json();
    const teamId = teams.items[0].id;
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 3);
    const response = await fetch(
      `/api/v1/teams/${teamId}/availability?from=${from.toISOString()}&to=${to.toISOString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return { status: response.status, body: await response.json() };
  });
  expect(availability.status).toBe(200);
  const personalBlocks = availability.body.members.flatMap((member: { blocks: { event_id: number | null; title: string | null; busy: boolean }[] }) =>
    member.blocks.filter((block) => block.event_id === null),
  );
  expect(personalBlocks.length).toBeGreaterThan(0);
  expect(personalBlocks.every((block: { busy: boolean; title: string | null }) => block.busy && block.title === null)).toBe(true);
  expect(JSON.stringify(availability.body)).not.toContain("个人面试");
});
