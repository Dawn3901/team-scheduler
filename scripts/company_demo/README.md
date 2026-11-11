# 大公司模拟数据

这是独立的本地测试工具，不读写 `server/data/teamsync.db`，不修改已有 `make seed`。

## 数据规模

- 500 个虚构员工账号，10 个部门，每部门 50 人。
- 1 个全员协作团队 + 10 个部门团队。
- 9822 场活动、79400 条参与者记录，包括团队可见、私密、接受/待定/待回应/拒绝。
- 5061 项任务、8089 条依赖。其中全员团队 5000 项任务、8039 条依赖，含 1200 层长链。
- 每周 12 次、双周 8 次两个现成活动系列。
- 500 人全员战略会，用于演示改期后的回应重置。
- 部门内有 6 步项目流程，方便展示可读的依赖图。

正常产品加入团队的上限仍为 **50 人**。500 人全员团队是直接写入的超规格测试夹具，用来寻找瓶颈，不能解释为已经支持企业规模部署。部门团队遵守50人限制。正常产品单团队活动上限10000，造数留出新增活动空间。

员工姓名、邮箱和公司名全部虚构。默认公开演示密码为 `CompanyDemo2026!`，也可以在首次造数时通过 `COMPANY_DEMO_PASSWORD` 设置。密码仅属于这个独立演示库。员工账号为 `corp0001` 至 `corp0500`，完整名单见生成目录的 `accounts.csv`。`corp0001` 是全员团队 Owner 和研发部 Owner，每隔50人的部门负责人为全员 Admin。

## 生成与自动验证

在仓库根目录执行（需要已有 server 的 dev 依赖）：

```bash
server/.venv/bin/python -m scripts.company_demo seed
server/.venv/bin/python -m scripts.company_demo verify
```

默认目录为 `debug/company-demo-500/`。`seed` 固定随机种子为20261109，基准日期为运行当天之后的下周一，拒绝覆盖已有数据库。要重建请指定新目录：

```bash
server/.venv/bin/python -m scripts.company_demo seed --directory debug/company-demo-new
server/.venv/bin/python -m scripts.company_demo verify --directory debug/company-demo-new
```

验证使用 SQLite backup API 创建临时副本，所有新增、取消、改期、任务状态变更和提醒都发生在副本上。测试完成后演示库保留最初场景。输出 `report.md` 和 `report.json`，包含各场景结果、单次请求耗时、SQL条数和响应大小。出现失败时命令非零退出。报告耗时包含路由、鉴权、序列化和数据库，属于单机串行观测，不是p95或并发吞吐量。

## 浏览器演示

单独启动后端，不占用日常服务端口：

```bash
server/.venv/bin/python -m scripts.company_demo serve --port 8018
```

另一个终端启动前端：

```bash
cd apps/web
VITE_API_TARGET=http://127.0.0.1:8018 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186 --strictPort
```

浏览器打开 `http://127.0.0.1:5186`，用 `corp0001` 登录。独立端口也会隔离浏览器登录存储，正常服务继续用原端口。两个终端分别按 Ctrl+C 停止。

演示建议：

1. 先进入全员团队，查看成员与大量活动，日历跳到 `manifest.json` 中 `base_local` 所在周。
2. 智能找空闲选择该周周一：必到前20人，可选员工21–120。限定09:00–10:00会看到0.7分，放宽工作窗口后有更高分候选。
3. 创建推荐活动后，在表单设置每周或双周重复，在详情选择本次、未来或整个系列修改。
4. 进入研发部查看6步依赖图。第二步进行中时，第三步阻塞；完成第二步后第三步解锁。其他部门需切换对应成员账号。
5. 全员战略会在基准周三18:00，修改时间或地点，然后用 `corp0002` 登录查看“待重新确认”。
6. 全员团队依赖图包含5000节点，是极端数据场景；先用部门视图演示规则，再观察大图性能。

## 验证边界

脚本覆盖四项拓展与数据完整性，不修改业务实现、不绕过API中的权限或冲突校验。背景数据通过ORM批量插入，确定性系列通过真实业务服务创建。当前未覆盖真实浏览器大图渲染、Android大数据体验、网络延迟、多worker和多用户并发。

`runtime.json` 包含本地随机JWT密钥，权限设置为600。整个 `debug/` 已被git忽略，不应提交数据库、账号清单或运行配置。不要用本演示配置部署公网服务。
