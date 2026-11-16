import { expect, test, type Page } from "@playwright/test";

async function register(page: Page): Promise<void> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`e2e_sidebar_${suffix}`);
  await page.getByLabel("显示名").fill("E2E Sidebar");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("heading", { name: "我的团队" })).toBeVisible();
}

async function openTeamCalendar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "创建团队" }).click();
  await page.getByLabel("团队名称").fill(`侧栏回归 ${Date.now()}`);
  await page.getByRole("form", { name: "创建团队表单" }).getByRole("button", { name: "创建团队" }).click();
  await expect(page.getByRole("heading", { name: "团队日历", exact: true })).toBeVisible();
}

test("矮视口下团队日历：侧栏在深色区域内滚动，不露出白底", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await register(page);
  await openTeamCalendar(page);

  const metrics = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".app-sidebar")!;
    const user = document.querySelector<HTMLElement>(".sidebar-user")!;
    const rect = sidebar.getBoundingClientRect();
    const style = getComputedStyle(sidebar);
    return {
      viewportHeight: window.innerHeight,
      canScroll: sidebar.scrollHeight > sidebar.clientHeight,
      overflowY: style.overflowY,
      maxHeightOk: rect.height <= window.innerHeight + 1,
      userVisibleBeforeScroll: user.getBoundingClientRect().bottom <= window.innerHeight + 1,
      scrollHeight: sidebar.scrollHeight,
      clientHeight: sidebar.clientHeight,
      // 滚动到底后，最后一个导航项仍在侧栏内（说明滚动容器是深色侧栏本身）。
      sidebarTop: rect.top,
      sidebarLeft: rect.left,
      sidebarWidth: rect.width,
      topAfterScroll: sidebar.scrollTop,
    };
  });

  expect(metrics.overflowY).toBe("auto");
  expect(metrics.maxHeightOk).toBe(true);
  // 内容高于视口时必须在侧栏内部滚动，而不是把页面拉长/露出白底。
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".app-sidebar")!.scrollTop = 10_000;
  });
  const afterScroll = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".app-sidebar")!;
    const about = [...sidebar.querySelectorAll<HTMLElement>(".side-nav-item")].at(-1)!;
    const box = about.getBoundingClientRect();
    return { scrolled: sidebar.scrollTop > 0, aboutBottom: box.bottom, sidebarBottom: sidebar.getBoundingClientRect().bottom };
  });
  if (metrics.canScroll) {
    expect(afterScroll.scrolled).toBe(true);
    expect(afterScroll.aboutBottom).toBeLessThanOrEqual(afterScroll.sidebarBottom + 1);
  }
  // 用户区吸底可见
  expect(metrics.userVisibleBeforeScroll).toBe(true);

  await page.screenshot({ path: "test-results/sidebar-short-viewport.png" });
});

test("桌面端 AI 助手不被侧栏遮挡", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await register(page);
  await openTeamCalendar(page);

  const launcher = page.getByRole("button", { name: "✦ AI 助手" });
  await expect(launcher).toBeVisible();

  const boxes = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".app-sidebar")!.getBoundingClientRect();
    const widget = document.querySelector<HTMLElement>(".ai-widget")!.getBoundingClientRect();
    return { sidebarRight: sidebar.right, widgetLeft: widget.left, widgetRight: widget.right, width: window.innerWidth };
  });
  expect(boxes.widgetLeft).toBeGreaterThanOrEqual(boxes.sidebarRight);
  expect(boxes.widgetRight).toBeLessThanOrEqual(boxes.width);
});
