import { expect, test } from "@playwright/test";

test("AI 助手拖动隐藏恢复、草稿确认与冲突创建", async ({ page }) => {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const registration = await page.request.post("/api/v1/auth/register", { data: {
    username: `ai_${suffix}`, display_name: "助手测试成员", password: "assistant-test-password",
  } });
  expect(registration.status()).toBe(201);
  const auth = await registration.json();
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const response = await page.request.post("/api/v1/teams", { headers, data: { name: "AI 助手测试" } });
  const team = await response.json();
  await page.addInitScript(token => {
    localStorage.setItem("teamsync.token", token);
    localStorage.setItem("teamsync.tutorial.seen", "1");
  }, auth.access_token);
  let aiCalls = 0;
  const draft = {
    title: "AI 项目讨论会", start_at: "2035-01-31T15:30:00Z", end_at: "2035-01-31T16:30:00Z",
    all_day: false, visibility: "team", participant_ids: [], location: "研讨室",
  };
  // 模型响应确定性替身；注册、鉴权、确认创建、冲突、详情全部走真实后端。
  await page.route(`**/teams/${team.id}/assistant/chat`, route => {
    aiCalls++;
    return route.fulfill({ json: { answer: "已整理活动草稿，请核对后确认创建。", draft } });
  });
  await page.goto(`/app/teams/${team.id}/members`);
  const launcher = page.getByRole("button", { name: "✦ AI 助手" });
  await expect(launcher).toBeVisible();
  const original = (await launcher.boundingBox())!;
  await page.mouse.move(original.x + 45, original.y + 20);
  await page.mouse.down();
  await page.mouse.move(original.x - 80, original.y - 60, { steps: 10 });
  await page.mouse.up();
  const moved = (await launcher.boundingBox())!;
  expect(moved.x).toBeLessThan(original.x - 40);
  await expect(page.getByLabel("给 AI 助手发送消息")).toHaveCount(0);
  await launcher.click();
  await page.getByLabel("给 AI 助手发送消息").fill("明天晚上安排一个小时的项目讨论会");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const card = page.getByRole("region", { name: "活动草稿" });
  await expect(card).toContainText("2035-01-31 23:30");
  const listUrl = `/api/v1/teams/${team.id}/events?from=2035-01-01T00:00:00Z&to=2035-02-28T00:00:00Z`;
  const before = await page.request.get(listUrl, { headers });
  expect((await before.json()).total).toBe(0);
  await card.getByRole("button", { name: "确认创建活动" }).click();
  await expect(page.getByRole("link", { name: "查看活动" })).toBeVisible();
  await page.getByRole("link", { name: "查看活动" }).click();
  await expect(page.getByRole("heading", { name: draft.title, exact: true })).toBeVisible();
  await page.getByLabel("给 AI 助手发送消息").fill("再创建同一时间的活动");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await card.getByRole("button", { name: "确认创建活动" }).click();
  await expect(page.getByRole("button", { name: "忽略冲突并创建" })).toBeVisible();
  await page.getByRole("button", { name: "忽略冲突并创建" }).click();
  await expect(card).toBeHidden();
  const after = await page.request.get(listUrl, { headers });
  expect((await after.json()).total).toBe(2);
  expect(aiCalls).toBe(2);
  await page.screenshot({ path: "debug/ai-assistant-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "隐藏 AI 助手" }).click();
  await expect(page.getByLabel("AI 助手", { exact: true })).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "显示 AI 助手" }).click();
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole("button", { name: "✦ AI 助手" }).click();
  await expect(page.getByLabel("给 AI 助手发送消息")).toBeVisible();
  const bounds = (await page.getByLabel("AI 助手", { exact: true }).boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(667);
  await page.screenshot({ path: "debug/ai-assistant-mobile.png", fullPage: true });
});
