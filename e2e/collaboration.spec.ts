import { expect, test, type Browser, type Page } from "@playwright/test";

async function setup(page: Page) {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2,6)}`;
  await page.goto("/register");
  await page.getByLabel("用户名").fill(`owner_${suffix}`);
  await page.getByLabel("显示名").fill("负责人");
  await page.getByLabel("密码").fill("e2e-correct-horse");
  await page.getByRole("button",{name:"注册并登录"}).click();
  await page.getByRole("button",{name:"创建团队"}).click();
  await page.getByLabel("团队名称").fill(`协作测试${suffix}`);
  await page.getByRole("form",{name:"创建团队表单"}).getByRole("button",{name:"创建团队"}).click();
  await expect(page.getByRole("heading",{name:"日历",exact:true})).toBeVisible();
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
  await expect(guest.getByRole("heading",{name:"日历",exact:true})).toBeVisible();
  return guest;
}

async function addEvent(page: Page, title: string, participants: string | string[] = []) {
  const names = Array.isArray(participants) ? participants : [participants];
  await page.getByRole("button",{name:"新建活动",exact:true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("活动标题").fill(title);
  await dialog.getByLabel("开始时间").fill("2028-11-02T14:00");
  await dialog.getByLabel("结束时间").fill("2028-11-02T15:00");
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

test("忙闲 → 冲突提示 → 强制保存 → 活动取消",async ({page}) => {
  const {base} = await setup(page);
  const first = await addEvent(page,"第一场会议");
  await expect(page.getByRole("dialog")).toBeHidden();
  await addEvent(page,"重叠会议");
  await expect(page.getByRole("heading",{name:"时间冲突"})).toBeVisible();
  await page.getByRole("button",{name:"仍然创建",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button",{name:"周",exact:true}).click();
  await expect(page.locator(".rbc-time-view")).toBeVisible();
  await page.getByRole("button",{name:"日",exact:true}).click();
  await expect(page.locator(".rbc-time-view")).toBeVisible();
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
  await page.getByRole("link",{name:"任务",exact:true}).click();
  await page.getByRole("button",{name:"新建任务",exact:true}).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务标题").fill("完成设计文档");
  await dialog.getByRole("button",{name:"保存任务"}).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("完成设计文档",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"完成任务",exact:true}).click();
  await expect(page.locator(".task-row.done")).toContainText("完成设计文档");
  await page.goto(base+"/calendar");
  await expect(page.locator(".rbc-event").filter({hasText:"完成设计文档"})).toBeVisible();
  await page.locator(".rbc-event").filter({hasText:"完成设计文档"}).click();
  await page.getByRole("button",{name:"重新打开"}).click();
  await expect(page.getByRole("button",{name:"完成任务",exact:true})).toBeVisible();
  page.on("dialog",dialog => dialog.accept());
  await page.getByRole("button",{name:"删除",exact:true}).click();
  await expect(page.getByText("暂无任务，创建一项团队任务吧。")).toBeVisible();
  await page.setViewportSize({width:375,height:812});
  await page.goto(base+"/calendar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
  await context.setOffline(false);
  await expect(page.getByRole("heading",{name:"日历",exact:true})).toBeVisible();
  await expect(page.getByText("连接已断开，正在重连…")).toBeHidden();
  await page.screenshot({path:"debug/calendar-desktop.png",fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await page.screenshot({path:"debug/calendar-mobile.png",fullPage:true});
});
