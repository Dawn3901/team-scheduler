import { expect, test, type Page } from "@playwright/test";

/**
 * CR-016：团队沟通一期。
 * 覆盖：通告发布 → 成员确认 → 作者看回执；活动邀请备注（组织者/本人可见，第三人不可见）；
 * 任务受阻 → 解除；收件箱 @ 提醒与读位。
 */
async function register(page: Page, username: string, displayName: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("显示名").fill(displayName);
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

async function joinTeam(page: Page, code: string): Promise<void> {
  await page.getByRole("button", { name: "用邀请码加入" }).click();
  await page.getByLabel("邀请码").fill(code);
  await page.getByRole("form", { name: "加入团队表单" }).getByRole("button", { name: "加入团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible({ timeout: 30_000 });
}

async function createTeam(page: Page, name: string): Promise<string> {
  await page.getByRole("button", { name: "创建团队" }).click();
  await page.getByLabel("团队名称").fill(name);
  await page.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname.match(/teams\/(\d+)/)?.[1] ?? "";
}

async function inviteCode(page: Page): Promise<string> {
  return (await page.locator(".invite-code").first().textContent())!.trim();
}

async function api<T>(page: Page, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return page.evaluate(
    async ({ path, init }) => {
      const token = localStorage.getItem("teamsync.token");
      const response = await fetch(`/api/v1${path}`, {
        method: init?.method ?? "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      return response.status === 204 ? (undefined as unknown as T) : await response.json();
    },
    { path, init },
  );
}

async function meId(page: Page): Promise<number> {
  return (await api<{ id: number }>(page, "/auth/me")).id;
}

test.afterEach(async ({ page }) => {
  // Vite dev 代理在多个短生命周期页面后会累积半关闭连接，显式关闭可让代理及时释放。
  await page.close().catch(() => undefined);
});

test("通告：Admin 发布，成员点我知道了，作者看到回执进度", async ({ browser }) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const owner = await browser.newPage();
  await register(owner, `annc_owner_${suffix}`, "组长");
  const teamId = await createTeam(owner, `通告队 ${suffix}`);
  const code = await inviteCode(owner);

  const member = await browser.newPage();
  await register(member, `annc_member_${suffix}`, "组员");
  await joinTeam(member, code);

  // 组织者发布一条需要确认的通告。
  await owner.goto(`/app/teams/${teamId}/announcements`);
  await owner.getByRole("button", { name: "发布通告" }).click();
  await owner.getByLabel("标题").fill("周五例会改到 16:00");
  await owner.getByLabel("正文").fill("全员必到，带上周进度");
  await owner.getByRole("button", { name: "发布", exact: true }).click();
  await expect(owner.getByTestId("announcement-card")).toHaveCount(1);
  await expect(owner.getByLabel("已确认 0/2")).toBeVisible();

  // 成员在通告页看到“待确认”，点击后进度变化。
  await member.goto(`/app/teams/${teamId}/announcements`);
  await expect(member.getByText("周五例会改到 16:00")).toBeVisible();
  await member.getByRole("button", { name: "我知道了" }).click();
  await expect(member.getByText("已确认", { exact: true })).toBeVisible();

  await owner.reload();
  await expect(owner.getByLabel("已确认 1/2")).toBeVisible();
  await owner.getByRole("button", { name: "回执" }).click();
  const dialog = owner.getByRole("dialog", { name: "回执名单" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("已确认 1/2")).toBeVisible();
  await expect(dialog.getByText("未确认")).toBeVisible();
  await owner.close();
  await member.close();
});

test("参与者备注：组织者与本人可见，第三人看不到", async ({ browser }) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const owner = await browser.newPage();
  await register(owner, `note_owner_${suffix}`, "组长");
  const teamId = await createTeam(owner, `备注队 ${suffix}`);
  const code = await inviteCode(owner);

  const member = await browser.newPage();
  await register(member, `note_member_${suffix}`, "组员乙");
  await joinTeam(member, code);
  const third = await browser.newPage();
  await register(third, `note_third_${suffix}`, "组员丙");
  await joinTeam(third, code);

  const guestId = await meId(member);
  const start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  const event = await api<{ id: number }>(owner, `/teams/${teamId}/events`, {
    method: "POST",
    body: {
      title: "带电脑的评审",
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + 3600_000).toISOString(),
      participant_ids: [guestId],
      ignore_conflicts: true,
    },
  });
  await api(owner, `/events/${event.id}/participants/${guestId}`, {
    method: "PATCH",
    body: { note: "记得带电脑，提前 15 分钟到" },
  });

  // 组织者与本人看到备注；第三人（同团队成员但非参与者）看不到。
  await owner.goto(`/app/teams/${teamId}/events/${event.id}`);
  await expect(owner.getByText("备注：记得带电脑，提前 15 分钟到")).toBeVisible();
  await member.goto(`/app/teams/${teamId}/events/${event.id}`);
  await expect(member.getByText("备注：记得带电脑，提前 15 分钟到")).toBeVisible();

  const thirdView = await api<{ participants: Array<{ user_id: number; note: string | null }> }>(
    third,
    `/events/${event.id}`,
  );
  expect(thirdView.participants.every(p => p.note === null)).toBe(true);
  await owner.close();
  await member.close();
  await third.close();
});

test("任务受阻：标记原因 → 卡片显示 → 解除后收起", async ({ page }) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await register(page, `block_${suffix}`, "负责人");
  const teamId = await createTeam(page, `受阻队 ${suffix}`);

  await page.goto(`/app/teams/${teamId}/tasks`);
  await page.getByRole("button", { name: "新建任务" }).click();
  await page.getByLabel("任务标题").fill("写接口文档");
  await page.getByLabel("要求 / 交接说明（可选，会写进任务讨论）").fill("按模板写，先给初稿");
  await page.getByRole("button", { name: "保存任务" }).click();
  await expect(page.getByText("写接口文档")).toBeVisible();

  await page.getByRole("button", { name: "标记受阻" }).click();
  await page.getByLabel("在等什么？").fill("等设计稿确认");
  await page.getByRole("dialog", { name: "标记受阻" }).getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("受阻：等设计稿确认")).toBeVisible();

  await page.getByRole("button", { name: "解除受阻" }).click();
  await expect(page.getByText("受阻：等设计稿确认")).toHaveCount(0);
});

test("收件箱：被 @ 后出现提醒，打开后清零", async ({ browser }) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const owner = await browser.newPage();
  await register(owner, `inbox_owner_${suffix}`, "组长");
  const teamId = await createTeam(owner, `收件箱队 ${suffix}`);
  const code = await inviteCode(owner);

  const member = await browser.newPage();
  await register(member, `inbox_member_${suffix}`, "组员");
  await joinTeam(member, code);
  const guestId = await meId(member);

  const task = await api<{ id: number }>(owner, `/teams/${teamId}/tasks`, {
    method: "POST",
    body: {
      title: "核对日程",
      assignee_id: guestId,
      due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    },
  });
  await api(owner, `/tasks/${task.id}/messages`, {
    method: "POST",
    body: { body: "@组员 帮忙核对一下", mention_user_ids: [guestId] },
  });

  await member.goto("/app/inbox");
  await expect(member.getByText("核对日程")).toBeVisible();
  await expect(member.locator(".inbox-kind").filter({ hasText: "@我" })).toBeVisible();

  await member.getByRole("button", { name: /核对日程/ }).click();
  await expect(member.getByRole("heading", { name: "任务看板" })).toBeVisible();
  await member.goto("/app/inbox");
  await expect(member.getByText(/收件箱是空的/)).toBeVisible();
  await owner.close();
  await member.close();
});

test("普通成员不能发布通告（前端无入口、后端 403）", async ({ browser }) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const owner = await browser.newPage();
  await register(owner, `perm_owner_${suffix}`, "组长");
  const teamId = await createTeam(owner, `权限队 ${suffix}`);
  const code = await inviteCode(owner);

  const member = await browser.newPage();
  await register(member, `perm_member_${suffix}`, "组员");
  await joinTeam(member, code);

  await member.goto(`/app/teams/${teamId}/announcements`);
  await expect(member.getByRole("heading", { name: "团队通告" })).toBeVisible();
  await expect(member.getByRole("button", { name: "发布通告" })).toHaveCount(0);

  const forbidden = await member.evaluate(async (team) => {
    const token = localStorage.getItem("teamsync.token");
    const response = await fetch(`/api/v1/teams/${team}/announcements`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "越权", body: "x" }),
    });
    return response.status;
  }, teamId);
  expect(forbidden).toBe(403);
  await owner.close();
  await member.close();
});
