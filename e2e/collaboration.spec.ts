import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

async function setup(page: Page) {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2,6)}`;
  await page.goto("/register");
  await page.evaluate(() => sessionStorage.clear());
  await page.getByLabel("用户名").fill(`owner_${suffix}`);
  await page.getByLabel("显示名").fill("负责人");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button",{name:"注册并登录"}).click();
  await page.getByRole("button",{name:"创建团队"}).click();
  await page.getByLabel("团队名称").fill(`协作测试${suffix}`);
  await page.getByRole("form",{name:"创建团队表单"}).getByRole("button",{name:"创建团队"}).click();
  await expect(page.getByRole("heading",{name:"团队日历",exact:true})).toBeVisible();
  const base = page.url().replace(/\/calendar$/,"");
  return {base, suffix, code: (await page.locator(".invite-code").textContent())!.trim()};
}

async function joinAs(browser: Browser, code: string, username: string, displayName: string) {
  const guest = await browser.newPage();
  await guest.goto("/register");
  await guest.getByLabel("用户名").fill(username);
  await guest.getByLabel("显示名").fill(displayName);
  await guest.getByLabel("密码").fill("e2e-correct-horse");
  await guest.getByRole("button",{name:"注册并登录"}).click();
  await guest.getByRole("button",{name:"用邀请码加入"}).click();
  await guest.getByLabel("邀请码",{exact:true}).fill(code);
  await guest.getByRole("button",{name:"加入团队",exact:true}).click();
  await expect(guest.getByRole("heading",{name:"团队日历",exact:true})).toBeVisible();
  return guest;
}

interface EventOptions {
  start?: string;
  end?: string;
  allDay?: boolean;
}

async function addEvent(
  page: Page,
  title: string,
  participants: string | string[] = [],
  options: EventOptions = {},
) {
  const names = Array.isArray(participants) ? participants : [participants];
  const start = options.start ?? "2028-11-02T14:00";
  const end = options.end ?? "2028-11-02T15:00";
  await page.getByRole("button",{name:"新建活动",exact:true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("活动标题").fill(title);
  if(options.allDay) await dialog.getByLabel("全天活动").check();
  await dialog.locator('input[name="start"]').fill(options.allDay ? start.slice(0,10) : start);
  await dialog.locator('input[name="end"]').fill(options.allDay ? end.slice(0,10) : end);
  for(const name of names) await dialog.getByLabel(name,{exact:true}).check();
  const response = page.waitForResponse(r => r.url().includes("/events") && r.request().method() === "POST");
  await dialog.getByRole("button",{name:"保存活动"}).click();
  return (await response).json();
}

async function respond(page: Page, title: string, response: "接受" | "拒绝" | "待定") {
  await page.getByRole("link",{name:/通知 \(/}).click();
  await page.getByRole("button").filter({hasText:title}).click();
  await expect(page.getByRole("heading",{name:title})).toBeVisible();
  await page.getByRole("button",{name:response,exact:true}).click();
}

async function untilVisible(button: Locator, target: Locator, max = 8) {
  for (let i = 0; i < max; i += 1) {
    if (await target.first().isVisible().catch(() => false)) return;
    await button.click();
    try {
      await target.first().waitFor({ state: "visible", timeout: 1500 });
      return;
    } catch {
      // 当前视图还没加载到目标，继续翻页。
    }
  }
}

test("建活动 → 成员收到通知 → RSVP → 组织者实时刷新",async ({browser,page}) => {
  const {base,suffix,code} = await setup(page);
  const guest = await joinAs(browser, code, `guest_${suffix}`, "受邀成员");
  await expect(page.getByText("团队空间 · 2 位成员")).toBeVisible();
  await addEvent(page,"讨论分工","受邀成员");
  await expect(page.getByRole("dialog")).toBeHidden();
  await respond(guest,"讨论分工","接受");
  const eventUrl = guest.url();
  await page.goto(eventUrl);
  await expect(page.locator(".work-row").filter({hasText:"受邀成员"})).toContainText("接受");
  await guest.getByRole("button",{name:"待定",exact:true}).click();
  await expect(page.locator(".work-row").filter({hasText:"受邀成员"})).toContainText("待定");
  await guest.close();
  await page.goto(base+"/calendar");
});

test("B 接受、C 拒绝，组织者看到两种状态",async ({browser,page}) => {
  const {base,suffix,code} = await setup(page);
  const guestB = await joinAs(browser, code, `guest_b_${suffix}`, "受邀成员B");
  const guestC = await joinAs(browser, code, `guest_c_${suffix}`, "受邀成员C");
  await expect(page.getByText("团队空间 · 3 位成员")).toBeVisible();
  const event = await addEvent(page,"双人 RSVP 活动",["受邀成员B","受邀成员C"]);
  await expect(page.getByRole("dialog")).toBeHidden();
  await respond(guestB,"双人 RSVP 活动","接受");
  await respond(guestC,"双人 RSVP 活动","拒绝");
  await page.goto(`${base}/events/${event.id}`);
  await expect(page.locator(".work-row").filter({hasText:"受邀成员B"})).toContainText("接受");
  await expect(page.locator(".work-row").filter({hasText:"受邀成员C"})).toContainText("拒绝");
  await guestB.close();
  await guestC.close();
});

test("跨月多日活动在月/周/日视图都不丢",async ({page}) => {
  await setup(page);
  const range = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const year = value("year");
    const month = value("month");
    // 下个月最后一天 20:00 → 再 +2 天 02:00，确保跨月、跨天（日历展示 08:00–22:00）。
    const start = new Date(Date.UTC(year, month + 1, 0));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 2);
    const fmt = (date: Date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`;
    return {start: fmt(start), end: fmt(end)};
  });

  const title = "跨月多日活动";
  await addEvent(page,title,[],{start:`${range.start}T20:00`, end:`${range.end}T02:00`});
  await expect(page.getByRole("dialog")).toBeHidden();

  const chip = page.locator(".rbc-event, .timeline-event, .timeline-allday button").filter({hasText:title});
  await page.getByRole("button",{name:"月",exact:true}).click();
  const next = page.getByRole("button",{name:"下一页",exact:true});
  const prev = page.getByRole("button",{name:"上一页",exact:true});

  // 月视图：开始月与结束月都要有段。
  await untilVisible(next, chip, 6);
  await expect(chip.first()).toBeVisible();
  await next.click();
  await expect(chip.first()).toBeVisible();
  await prev.click();

  // 周视图：从开始月向后找包含活动的周。
  await page.getByRole("button",{name:"周",exact:true}).click();
  await untilVisible(next, chip, 6);
  await expect(chip.first()).toBeVisible();

  // 日视图：从活动周向后找到活动覆盖的当天。
  await page.getByRole("button",{name:"日",exact:true}).click();
  await untilVisible(next, chip, 7);
  await expect(chip.first()).toBeVisible();
});

test("忙闲 → 冲突提示 → 强制保存 → 活动取消",async ({page}) => {
  const {base} = await setup(page);
  const first = await addEvent(page,"第一场会议");
  await expect(page.getByRole("dialog")).toBeHidden();
  await addEvent(page,"重叠会议");
  await expect(page.getByRole("heading",{name:"时间冲突"})).toBeVisible();
  await page.getByRole("button",{name:"仍然创建",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button",{name:"周",exact:true}).click();
  await expect(page.getByLabel("可缩放时间轴，使用滚轮调整粒度，方向键滚动")).toBeVisible();
  await page.getByRole("button",{name:"日",exact:true}).click();
  await expect(page.getByLabel("可缩放时间轴，使用滚轮调整粒度，方向键滚动")).toBeVisible();
  await page.getByRole("button",{name:"月",exact:true}).click();
  await page.getByLabel("显示周忙闲").check();
  await expect(page.getByRole("heading",{name:"本周成员忙闲"})).toBeVisible();
  await page.goto(`${base}/events/${first.id}`);
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button",{name:"取消活动",exact:true}).click();
  await expect(page.getByText(/已取消/)).toBeVisible();
});

test("任务指派 → 完成 → 日历截止 → 重开与删除",async ({page}) => {
  const {base} = await setup(page);
  await page.getByRole("link",{name:"任务看板",exact:true}).click();
  await page.getByRole("button",{name:"新建任务",exact:true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务标题").fill("完成设计文档");
  await dialog.getByRole("button",{name:"保存任务"}).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("完成设计文档",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"完成任务",exact:true}).click();
  await expect(page.locator(".task-row.done")).toContainText("完成设计文档");
  await page.goto(base+"/calendar");
  await expect(page.locator(".rbc-event, .timeline-event, .timeline-allday button").filter({hasText:"完成设计文档"})).toBeVisible();
  await page.locator(".rbc-event, .timeline-event, .timeline-allday button").filter({hasText:"完成设计文档"}).click();
  await expect(page.getByRole("button",{name:"返回日历"})).toBeVisible();
  await page.getByRole("button",{name:"重新打开"}).click();
  await expect(page.getByRole("button",{name:"完成任务",exact:true})).toBeVisible();
  page.on("dialog",dialog => dialog.accept());
  await page.getByRole("button",{name:"删除",exact:true}).click();
  await expect(page.getByText("暂无任务，创建一项团队任务吧。")).toBeVisible();
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+"/calendar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("时间轴滚轮缩放与空闲时段展开",async ({page}) => {
  await setup(page);
  const viewport = page.getByLabel("可缩放时间轴，使用滚轮调整粒度，方向键滚动");
  const scale = page.locator(".timeline-controls output");
  await expect(scale).toHaveText("1 小时");
  await viewport.hover();
  await page.mouse.wheel(0,-100);
  await expect(scale).toHaveText("30 分钟");
  await page.mouse.wheel(0,100);
  await expect(scale).toHaveText("1 小时");
  await page.getByRole("button",{name:/00:00 — 08:00/}).click();
  await expect(page.getByRole("button",{name:/03:00 新建活动/})).toHaveCount(7);
  await page.getByRole("button",{name:"重新折叠空闲时段"}).click();
  await expect(page.getByRole("button",{name:/03:00 新建活动/})).toHaveCount(0);
});

test("从日历进入活动再返回保留视图、缩放和展开状态",async ({page}) => {
  await setup(page);
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const value = (type:string) => parts.find(part => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  });
  await page.getByRole("button",{name:"周",exact:true}).click();
  const viewport = page.getByLabel("可缩放时间轴，使用滚轮调整粒度，方向键滚动");
  await viewport.hover();
  await page.mouse.wheel(0,-100);
  await expect(page.locator(".timeline-controls output")).toHaveText("30 分钟");
  await page.getByRole("button",{name:/00:00 — 08:00/}).click();
  await addEvent(page,"返回保留测试",[],{start:`${today}T10:00`,end:`${today}T11:00`});
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.locator(".timeline-event").filter({hasText:"返回保留测试"}).click();
  await expect(page.getByRole("button",{name:"返回日历"})).toBeVisible();
  await page.getByRole("button",{name:"返回日历"}).click();
  await expect(page.locator(".timeline-controls output")).toHaveText("30 分钟");
  await expect(page.getByRole("button",{name:"重新折叠空闲时段"})).toBeVisible();
});

test("从月视图进入活动再返回保留月视图",async ({page}) => {
  await setup(page);
  const today = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const value = (type:string) => parts.find(part => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
  });
  await page.getByRole("button",{name:"月",exact:true}).click();
  await addEvent(page,"月视图返回测试",[],{start:`${today}T10:00`,end:`${today}T11:00`});
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.locator(".rbc-event").filter({hasText:"月视图返回测试"}).click();
  await page.getByRole("button",{name:"返回日历"}).click();
  await expect(page.locator(".rbc-month-view")).toBeVisible();
  await expect(page.locator(".cal-view.active")).toHaveText("月");
});

test("375px 周视图在日历容器内横滑，不撑破页面",async ({page}) => {
  const {base} = await setup(page);
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+"/calendar");
  await page.getByRole("button",{name:"周",exact:true}).click();
  await expect(page.getByLabel("可缩放时间轴，使用滚轮调整粒度，方向键滚动")).toBeVisible();

  const before = await page.locator(".timeline-horizontal").evaluate(el => {
    const box = el as HTMLElement;
    return {
      canScroll: box.scrollWidth > box.clientWidth + 1,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(before.canScroll).toBe(true);
  expect(before.pageOverflow).toBe(false);

  await page.locator(".timeline-horizontal").evaluate(el => {
    (el as HTMLElement).scrollLeft = (el as HTMLElement).scrollWidth;
  });
  expect(await page.locator(".timeline-horizontal").evaluate(el => (el as HTMLElement).scrollLeft)).toBeGreaterThan(0);
});

test("资料保存、邀请码轮换和团队删除",async ({page}) => {
  const {base,code} = await setup(page);
  await page.getByRole("link",{name:"个人资料",exact:true}).click();
  await page.getByLabel("显示名").fill("新的负责人");
  await page.getByRole("button",{name:"保存资料"}).click();
  await expect(page.locator(".header-name")).toHaveText("新的负责人");
  await page.goto(base+"/settings");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button",{name:"轮换邀请码",exact:true}).click();
  await expect(page.locator(".invite-code")).not.toHaveText(code);
  await page.getByRole("button",{name:"删除团队",exact:true}).click();
  await expect(page.getByRole("heading",{name:"我的团队",exact:true})).toBeVisible();
  await expect(page.getByText("还没有加入任何团队")).toBeVisible();
});

test("断网恢复后重新连接并刷新",async ({page,context}) => {
  await setup(page);
  await context.setOffline(true);
  await expect(page.getByText("连接已断开，正在重连…")).toBeVisible();
  // W4-09 演练：默认立即恢复；设置 RECONNECT_OFFLINE_MS=30000 可复现“断网 30 秒”。
  const offlineMs = Number(process.env.RECONNECT_OFFLINE_MS ?? 0);
  if (Number.isFinite(offlineMs) && offlineMs > 0) {
    await page.waitForTimeout(offlineMs);
  }
  await context.setOffline(false);
  await expect(page.getByRole("heading",{name:"团队日历",exact:true})).toBeVisible();
  await expect(page.getByText("连接已断开，正在重连…")).toBeHidden();
  await page.screenshot({path:"debug/calendar-desktop.png",fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:"debug/calendar-mobile.png",fullPage:true});
});

test("新建活动：不邀请自己、可邀请全员，Esc 取消",async ({browser,page}) => {
  const {base,code,suffix} = await setup(page);
  const guest = await joinAs(browser, code, `guest_${suffix}`, "成员甲");
  await page.goto(base+"/calendar");
  await page.getByRole("button",{name:"新建活动",exact:true}).click();
  const dialog = page.getByRole("dialog",{name:"新建活动"});
  const boxes = dialog.locator('input[name="participants"]');
  await expect(boxes).toHaveCount(1);
  await expect(dialog.getByLabel("负责人",{exact:true})).toHaveCount(0);
  await expect(dialog.getByLabel("成员甲",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"邀请全员"}).click();
  await expect(boxes.first()).toBeChecked();
  await dialog.getByRole("button",{name:"取消邀请全员"}).click();
  await expect(boxes.first()).not.toBeChecked();
  await expect(dialog.getByRole("button",{name:"邀请全员"})).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await guest.close();
});

test("新建任务按 Esc 取消",async ({page}) => {
  const {base} = await setup(page);
  await page.goto(base+"/tasks");
  await page.getByRole("button",{name:"新建任务",exact:true}).click();
  const dialog = page.getByRole("dialog",{name:"新建任务"});
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
