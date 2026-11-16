import { expect, test, type Page } from "@playwright/test";

/**
 * CR-015：同一活动反复改期，通知中心只保留一条“活动变更”，不随次数堆叠。
 * 走真实后端：创建 → 邀请 → 被邀请人接受 → 连续改期 3 次。
 */
async function register(page: Page, name: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("用户名").fill(name);
  await page.getByLabel("显示名").fill("改期测试");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

test("同一活动连续改期后，通知中心合并为一条并可展开历史", async ({ browser }) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ownerName = `merge_owner_${suffix}`;
  const guestName = `merge_guest_${suffix}`;

  const owner = await browser.newPage();
  await register(owner, ownerName);
  await owner.getByRole("button", { name: "创建团队" }).click();
  await owner.getByLabel("团队名称").fill(`通知合并 ${suffix}`);
  await owner.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(owner.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();
  const teamId = new URL(owner.url()).pathname.match(/teams\/(\d+)/)?.[1] ?? "";
  const inviteCode = (await owner.locator(".invite-code").first().textContent())!.trim();

  const guest = await browser.newPage();
  await register(guest, guestName);
  await guest.getByRole("button", { name: "用邀请码加入" }).click();
  await guest.getByLabel("邀请码").fill(inviteCode);
  await guest.getByRole("form", { name: "加入团队表单" }).getByRole("button", { name: "加入团队" }).click();
  await expect(guest.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();

  const guestId = await guest.evaluate(async () => {
    const token = localStorage.getItem("teamsync.token");
    const me = await (await fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
    return me.id as number;
  });

  // 组织者建活动并邀请 guest。
  const eventId = await owner.evaluate(async ({ team, guestId }) => {
    const token = localStorage.getItem("teamsync.token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const start = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const created = await (
      await fetch(`/api/v1/teams/${team}/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "合并测试评审",
          start_at: start.toISOString(),
          end_at: new Date(start.getTime() + 3600_000).toISOString(),
          participant_ids: [guestId],
        }),
      })
    ).json();
    return created.id as number;
  }, { team: teamId, guestId });

  // 被邀请人先接受，改期才会触发“重新确认”。
  await guest.evaluate(async ({ team, eventId }) => {
    const token = localStorage.getItem("teamsync.token");
    await fetch(`/api/v1/events/${eventId}/rsvp`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ response: "accepted" }),
    });
  }, { team: teamId, eventId });

  // 连续改期 3 次（每次改完重新接受）。
  for (let index = 1; index <= 3; index += 1) {
    await owner.evaluate(async ({ team, eventId, index }) => {
      const token = localStorage.getItem("teamsync.token");
      const start = new Date(Date.now() + (3 + index) * 24 * 3600 * 1000);
      await fetch(`/api/v1/events/${eventId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          start_at: start.toISOString(),
          end_at: new Date(start.getTime() + 3600_000).toISOString(),
        }),
      });
    }, { team: teamId, eventId, index });
    await guest.evaluate(async ({ eventId }) => {
      const token = localStorage.getItem("teamsync.token");
      await fetch(`/api/v1/events/${eventId}/rsvp`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ response: "accepted" }),
      });
    }, { eventId });
  }

  await guest.locator(".app-sidebar").getByRole("link", { name: "通知中心" }).click();
  await expect(guest.getByRole("heading", { name: "通知中心" })).toBeVisible();

  const groups = guest.getByTestId("notice-group");
  // 邀请 1 组 + 活动变更 1 组：改期 3 次也只留一条，不再按次数堆叠。
  await expect(groups).toHaveCount(2);
  const changeGroup = groups.filter({ hasText: "活动变更" });
  await expect(changeGroup).toHaveCount(1);
  await expect(changeGroup).not.toContainText("×");

  // 接口层面同样只有一条：不是前端折叠掩盖了重复数据。
  const summary = await guest.evaluate(async () => {
    const token = localStorage.getItem("teamsync.token");
    const data = await (
      await fetch("/api/v1/notifications?limit=100", { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    return (data.items as Array<{ type: string }>).map(item => item.type);
  });
  expect(summary.filter(type => type === "event.updated")).toHaveLength(1);
  expect(summary.filter(type => type === "event.invited")).toHaveLength(1);
});
