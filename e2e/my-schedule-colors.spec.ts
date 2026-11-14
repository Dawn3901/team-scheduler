import { expect, test, type Page } from "@playwright/test";

async function registerWithTeam(page: Page): Promise<{ teamId: string }> {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.evaluate(() => sessionStorage.clear());
  await page.getByLabel("用户名").fill(`urgency_${suffix}`);
  await page.getByLabel("显示名").fill("紧急度测试");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await page.getByRole("button", { name: "创建团队" }).click();
  await page.getByLabel("团队名称").fill(`紧急度团队${suffix}`);
  await page.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();
  return { teamId: new URL(page.url()).pathname.match(/teams\/(\d+)/)?.[1] ?? "" };
}

test("我的日程任务行按紧急度着色：逾期红、3 天内黄、正常白", async ({ page }) => {
  const { teamId } = await registerWithTeam(page);

  const created = await page.evaluate(async (team) => {
    const token = localStorage.getItem("teamsync.token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const now = Date.now();
    const tasks = [
      { title: "逾期任务", due_at: new Date(now - 48 * 3600 * 1000).toISOString() },
      { title: "两天后任务", due_at: new Date(now + 48 * 3600 * 1000).toISOString() },
      { title: "两周后任务", due_at: new Date(now + 14 * 24 * 3600 * 1000).toISOString() },
    ];
    const me = await (await fetch("/api/v1/auth/me", { headers })).json();
    for (const task of tasks) {
      const response = await fetch(`/api/v1/teams/${team}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: task.title,
          assignee_id: me.id,
          due_at: task.due_at,
          priority: "normal",
        }),
      });
      if (response.status !== 201) return `创建失败 ${task.title}: ${response.status}`;
    }
    return "ok";
  }, teamId);
  expect(created).toBe("ok");

  await page.goto("/app/me/calendar");
  await expect(page.getByRole("heading", { name: "我的日程" })).toBeVisible();

  const row = (title: string) => page.locator("li.personal-row", { hasText: title });
  await expect(row("逾期任务")).toHaveClass(/personal-row-urgent/);
  await expect(row("逾期任务")).toHaveAttribute("style", /rgb\(220, 38, 38\)/);
  await expect(row("两天后任务")).toHaveClass(/personal-row-soon/);
  await expect(row("两天后任务")).toHaveAttribute("style", /rgb\(234, 179, 8\)/);
  await expect(row("两周后任务")).toHaveClass(/personal-row-normal/);
  // 正常任务：浅底 + 灰边框，不出现红/黄。
  await expect(row("两周后任务")).toHaveAttribute("style", /rgb\(203, 213, 225\)/);
  await expect(row("两周后任务")).not.toHaveAttribute("style", /rgb\(220, 38, 38\)|rgb\(234, 179, 8\)/);
});
