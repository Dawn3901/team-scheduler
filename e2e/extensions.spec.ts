import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page) {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2,6)}`;
  const result = await page.request.post("/api/v1/auth/register",{data:{username:`ext_${suffix}`,display_name:"拓展负责人",password:"extension-test-password"}});
  expect(result.status()).toBe(201);
  const auth = await result.json();
  const headers = {Authorization:`Bearer ${auth.access_token}`};
  const created = await page.request.post("/api/v1/teams",{headers,data:{name:`拓展测试 ${suffix}`}});
  const team = await created.json();
  await page.addInitScript(token => localStorage.setItem("teamsync.token",token),auth.access_token);
  const base = `/app/teams/${team.id}`;
  await page.goto(base+"/calendar");
  await expect(page.getByRole("heading",{name:"团队日历",exact:true})).toBeVisible();
  return {base,team,headers,auth,suffix};
}

test("智能推荐 → 重复活动 → 成员回应 → 改期重新确认",async ({page,browser}) => {
  const {base,team,headers,suffix} = await setup(page);
  const registered = await page.request.post("/api/v1/auth/register",{data:{username:`guest_${suffix}`,display_name:"参会成员",password:"extension-test-password"}});
  const guestAuth = await registered.json();
  const guestHeaders = {Authorization:`Bearer ${guestAuth.access_token}`};
  await page.request.post("/api/v1/teams/join",{headers:guestHeaders,data:{invite_code:team.invite_code}});
  await expect(page.locator(".calendar-head").getByText(/2 位成员/)).toBeVisible();
  await page.getByRole("button",{name:"智能找空闲",exact:true}).click();
  const finding = page.getByRole("dialog",{name:"智能找空闲"});
  await finding.getByLabel("起始日期").fill("2028-01-03");
  await finding.getByLabel("结束日期（含当天）").fill("2028-01-03");
  await finding.getByRole("button",{name:"推荐时间",exact:true}).click();
  await expect(finding.locator(".suggestion-card")).toHaveCount(3);
  await page.screenshot({path:"debug/extensions-suggestions.png",fullPage:true});
  await finding.getByRole("button",{name:"用此时段创建活动"}).first().click();
  const editor = page.getByRole("dialog",{name:"新建活动"});
  await expect(editor.getByLabel("开始时间")).toHaveValue("2028-01-03T09:00");
  await expect(editor.getByLabel("结束时间")).toHaveValue("2028-01-03T10:00");
  await expect(editor.getByLabel("参会成员",{exact:true})).toBeChecked();
  await editor.getByLabel("活动标题").fill("每周研究组会");
  await editor.getByLabel("重复规则").selectOption("weekly");
  await editor.getByLabel("重复次数").fill("3");
  const response = page.waitForResponse(r=>r.request().method()==="POST" && /\/teams\/\d+\/events$/.test(r.url()));
  await editor.getByRole("button",{name:"保存活动"}).click();
  const event = await (await response).json();
  expect(event.series_count).toBe(3);
  await expect(editor).toBeHidden();
  await page.request.patch(`/api/v1/events/${event.id}/rsvp`,{headers:guestHeaders,data:{response:"accepted"}});
  await page.goto(base+`/events/${event.id}`);
  await expect(page.locator(".work-row").filter({hasText:"参会成员"})).toContainText("接受");
  const guest = await browser.newPage();
  await guest.addInitScript(token=>localStorage.setItem("teamsync.token",token),guestAuth.access_token);
  await guest.goto(`http://127.0.0.1:5180${base}/events/${event.id}`);
  await page.getByRole("button",{name:"编辑活动"}).click();
  const editing = page.getByRole("dialog",{name:"编辑活动"});
  await editing.getByLabel("修改范围").selectOption("future");
  await editing.getByLabel("地点",{exact:true}).fill("图书馆研讨室");
  await editing.getByRole("button",{name:"保存活动"}).click();
  await expect(editing).toBeHidden();
  await expect(guest.getByText("活动时间或地点已变更，请重新确认是否参加。")).toBeVisible();
  await guest.getByRole("button",{name:"接受",exact:true}).click();
  await expect(guest.getByText("活动时间或地点已变更，请重新确认是否参加。")).toBeHidden();
  await expect(page.locator(".work-row").filter({hasText:"参会成员"})).toContainText("接受");
  const listed = await page.request.get(`/api/v1/teams/${team.id}/events?from=2028-01-01T00:00:00Z&to=2028-02-01T00:00:00Z`,{headers});
  expect((await listed.json()).items.every((e:{location:string})=>e.location==="图书馆研讨室")).toBe(true);
  await guest.close();
});

async function addTask(page:Page, title:string, dependency?:string) {
  await page.getByRole("button",{name:"新建任务",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"新建任务"});
  await dialog.getByLabel("任务标题").fill(title);
  if(dependency) await dialog.getByLabel(`${dependency} · 未完成`,{exact:true}).check();
  await dialog.getByRole("button",{name:"保存任务"}).click();
  await expect(dialog).toBeHidden();
}

test("任务前置 → 阻塞 → 完成解锁 → 依赖图与循环拒绝",async ({page})=>{
  const {base}=await setup(page);
  await page.goto(base+"/tasks");
  await addTask(page,"准备资料");
  await addTask(page,"编写报告","准备资料");
  const parent=page.locator(".task-row").filter({has:page.getByText("准备资料",{exact:true})});
  const child=page.locator(".task-row").filter({has:page.getByText("编写报告",{exact:true})});
  await expect(child).toContainText("阻塞：请先完成 准备资料");
  await expect(child.getByRole("button",{name:"完成任务",exact:true})).toBeDisabled();
  await parent.getByRole("button",{name:"编辑",exact:true}).click();
  const editing=page.getByRole("dialog",{name:"编辑任务"});
  await editing.getByLabel("编写报告 · 未完成",{exact:true}).check();
  await editing.getByRole("button",{name:"保存任务"}).click();
  await expect(page.getByText("依赖关系形成循环，请调整前置任务",{exact:true})).toBeVisible();
  await editing.getByRole("button",{name:"取消",exact:true}).click();
  await parent.getByRole("button",{name:"完成任务",exact:true}).click();
  await expect(child.getByRole("button",{name:"完成任务",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"依赖关系图",exact:true}).click();
  await expect(page.getByRole("img",{name:"任务前置依赖关系图"})).toBeVisible();
  await page.screenshot({path:"debug/extensions-dependencies.png",fullPage:true});
  await child.getByRole("button",{name:"完成任务",exact:true}).click();
  await expect(child).toHaveClass(/done/);
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("重复系列本次修改、未来修改、取消例外不复活",async ({page})=>{
  const {base,team,headers}=await setup(page);
  const created=await page.request.post(`/api/v1/teams/${team.id}/events`,{headers,data:{title:"周期讨论",start_at:"2028-01-03T01:00:00Z",end_at:"2028-01-03T02:00:00Z",recurrence:{frequency:"weekly",count:3}}});
  const first=await created.json();
  const url=`/api/v1/teams/${team.id}/events?from=2028-01-01T00:00:00Z&to=2028-02-01T00:00:00Z`;
  const items=(await (await page.request.get(url,{headers})).json()).items;
  await page.goto(base+`/events/${items[1].id}`);
  page.on("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"取消活动",exact:true}).click();
  await expect(page.getByText(/已取消/)).toBeVisible();
  await page.goto(base+`/events/${first.id}`);
  await page.getByRole("button",{name:"编辑活动",exact:true}).click();
  const editor=page.getByRole("dialog",{name:"编辑活动"});
  await editor.getByLabel("修改范围").selectOption("all");
  await editor.getByLabel("活动标题").fill("更新后的周期讨论");
  await editor.getByRole("button",{name:"保存活动"}).click();
  await expect(editor).toBeHidden();
  const updated=(await (await page.request.get(url,{headers})).json()).items;
  expect(updated[1].status).toBe("cancelled");
  expect(updated[2].title).toBe("更新后的周期讨论");
  await page.getByLabel("取消删除范围").selectOption("all");
  await page.getByRole("button",{name:"取消活动",exact:true}).click();
  await expect(page.getByText(/已取消/)).toBeVisible();
  expect((await (await page.request.get(url,{headers})).json()).items.every((e:{status:string})=>e.status==="cancelled")).toBe(true);
});
