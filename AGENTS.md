# TeamSync · AI 协作约定

> 本目录（`team-scheduler/`）是独立的软件工程课程项目。**进入本目录后，以本文件为准**
>
> 这份文件是给“下一个 AI 对话”看的：先读什么、能改什么、不能改什么、怎么证明改对了。

---

## 0. 开始任何任务前，按顺序读

1. [`docs/00-需求与设计框架-v1.0.md`](docs/00-需求与设计框架-v1.0.md) — 定位、范围、15 条设计决策、已确认的 6 个取舍。
2. [`docs/02-需求规格说明书.md`](docs/02-需求规格说明书.md) — 需求编号、用例、验收标准、业务规则。
3. [`docs/03-概要设计说明书.md`](docs/03-概要设计说明书.md) — 表结构、API、算法、三端实现。
4. [`docs/ai/01-需求与验收约束.md`](docs/ai/01-需求与验收约束.md) — 不得绕过需求编号。
5. [`docs/ai/02-接口与数据契约.md`](docs/ai/02-接口与数据契约.md) — 不得静默改契约。
6. [`docs/ai/03-提示词与评审模板.md`](docs/ai/03-提示词与评审模板.md) — 任务怎么提、结果怎么报。
7. [`docs/ai/04-变更控制与追踪.md`](docs/ai/04-变更控制与追踪.md) — 要加需求/改表时怎么走。
8. [`docs/ai/05-验收与测试清单.md`](docs/ai/05-验收与测试清单.md) — 怎么证明做完了。

**没读文档就写代码，视为违规。**

---

## 1. 这是什么

TeamSync（同频）：面向 3–20 人小团队的共享日程 + 轻量任务协作工具。

- 三端：Web（全功能）、Electron（壳 + 托盘 + 系统通知）、Android（壳 + 本地通知）。
- 服务器权威；不做离线写；不做后台推送。
- 核心闭环：建团队 → 建活动 → 邀请/RSVP → 忙闲/冲突 → 任务截止 → 提醒。

**不是**：IM、视频会议、项目管理平台、排班系统、多日历、企业权限系统。

### 1.1 项目组配置：2 人 + AI

- 固定 2 名人类成员：**A 后端/数据/基础设施**，**B 前端/交互/三端/产品**；架构、契约、评审、验收、答辩由两人共同负责。
- AI 是工具，不是第三名成员：可以写实现/测试/文档草稿，但**不能做需求决策、契约批准、安全签字、最终验收**。
- 每个 PR 至少由**另一名人类** review；关键路径（认证、权限、私密脱敏、时区、迁移、冲突、提醒去重）**两人都 review**。
- 不允许自审自并；不允许 AI 生成“验收通过”的结论；紧急修复也要另一人事后 review 并补测试。
- 时间充足不等于可以加范围：省下的时间优先补边界测试、真机验证、文档与答辩，而不是 P1。

---

## 2. 技术栈与目录

| 目录 | 内容 |
|---|---|
| `server/` | FastAPI + SQLAlchemy 2.0 + Alembic + SQLite + APScheduler + WebSocket；pytest 在 `server/tests/` |
| `apps/web/` | React + Vite + TypeScript；TanStack Query + Zustand；`react-big-calendar` + `date-fns`；Tailwind + Radix |
| `apps/desktop/` | Electron 主进程 + preload；托盘、系统通知；不接本地 DB |
| `apps/mobile/` | Capacitor 7 Android 壳 + `@capacitor/local-notifications`；不做前台服务 |
| `packages/shared/` | 类型、API Client、WS Client、日期工具（纯 TS 源码包） |
| `docs/` | 需求、设计、验收、AI 约束 |
| `scripts/` | 种子数据、压测、开发脚本 |
| `demo/` | 纯静态交互原型（HTML/CSS/JS + 虚拟数据），用于确认界面与交互，不是正式实现 |
| `debug/` | 本地调试产物，不入库 |

> `demo/` 是视觉原型：没有后端、没有持久化、数据全是虚构的。它可以快速改，但**不要**把原型里的临时结构当成正式 API/表结构；正式实现仍以 `docs/03` 为准。

**分层规则**：

- 业务规则放 `server/app/services/`，不写在 router 或 React 组件里。
- 权限统一走 `deps.py` 的 `require_member / require_admin / require_owner`。
- 序列化脱敏放 schema/service，不靠前端隐藏。
- 前端不直接拼 API URL；走 `packages/shared/src/api`。
- 三端不复制业务逻辑；平台差异只放 `apps/desktop` / `apps/mobile`。

---

## 3. 常用命令

> 仓库骨架已建立（W1-02）。**命令不存在时不要假装跑过**；先补 Makefile/脚本，或在报告里写“未建立”。  
> Windows 下 Makefile 自动使用 `server/.venv/Scripts/python.exe`，Linux/WSL 使用 `server/.venv/bin/python`；`.venv` 不能跨平台复用，切换前先删除再 `make setup`。

```bash
# 一次性安装
make setup                      # 缺 .env 时自动生成随机 SECRET_KEY；再装 server/.venv + pnpm
make migrate                    # alembic upgrade head

# 开发
make dev                        # 后端 :8000 + 前端 :5173
make dev-api / make dev-web     # 分开启动

# 后端（Windows 用 .venv/Scripts/python.exe；也可直接 make test / make lint）
cd server && .venv/bin/python -m pytest
cd server && .venv/bin/ruff check .
cd server && .venv/bin/alembic upgrade head

# 前端
pnpm -r typecheck
pnpm -r lint

# 全量检查（DoD）
make check                      # pytest + vitest + typecheck + lint

# 种子 / 压测（尚未建立）
make seed                       # W1-09
python scripts/bench.py         # W5

# 三端
pnpm --filter @teamsync/web build
pnpm --filter @teamsync/desktop build   # tsc 编译主进程/preload
pnpm dev:desktop                        # 构建 Web + 启动 Electron 壳
pnpm sync:android                       # Web 构建 + cap sync android
cd apps/mobile/android && ./gradlew assembleDebug   # 需 Android SDK + JDK 17/21
```

### 命令约定

- **不要**在 WSL 里对 Maid 的 `node_modules` 跑 `pnpm install`；本项目独立安装依赖。
- **不要**引入 Docker/Redis/Celery 作为开发依赖；课程演示用本地/单机即可。部署若要用 Docker Compose，属于“改动边界”第 6 条，先问。
- **不要**改 `--workers` 为多进程；APScheduler 和 WS 都在进程内。
- 任何新增命令，必须同步更新本文件与 README。

---

## 4. 完成定义（DoD）

一个任务只有同时满足以下条件，才能说“完成”：

- [ ] 关联至少 1 个 P0 需求编号；实现与 PRD 一致。
- [ ] 新增/修改逻辑有测试；修 bug 有回归用例。
- [ ] `make check` 全绿（后端 pytest + 前端 Vitest + typecheck/lint）。
- [ ] 涉及权限/私密/时区/冲突/提醒的改动，有对应测试。
- [ ] API/DB 变更已更新 `docs/03` 与 `docs/ai/02`，并有迁移。
- [ ] 没有密钥、`.env`、调试日志、`console.log`、`print` 残留。
- [ ] 没有无关重构/格式化/重命名。
- [ ] 报告里写清：改了什么、跑了什么、结果、未验证的部分。

**跑不了就说跑不了。** 不要写“应该没问题”“已验证”而没有命令输出。

---

## 5. 改动边界（必须先问）

以下改动**必须先得到用户/两名项目成员明确同意**，不要自作主张：

1. 数据库 schema、迁移、索引、枚举、软删除策略。
2. 认证/授权模型、JWT 载荷、密码策略、CORS、限流。
3. API 路径、字段名、错误码、分页/时间格式、WS 消息类型。
4. 依赖增删（`pyproject.toml`、`package.json`、`pnpm-lock.yaml`）。
5. Electron/Capacitor 原生配置、权限、签名、打包配置。
6. CI/CD、Makefile 的目标语义、部署脚本。
7. `docs/ai/*` 约束文件、`docs/00` 已冻结决策。
8. 删除/重命名已存在的公开函数、组件、表、接口。
9. 引入新框架/状态库/UI 库/日历库。
10. 任何 P1 功能“顺手做”。

**允许直接做的**：在既有契约内补实现、补测试、修明确 bug、改文档错别字、加不改变行为的日志（不含敏感信息）。

---

## 6. 三条硬规则

### 6.1 多租户：每个团队查询都必须鉴权

- 所有 `/teams/{team_id}/...` 路由必须依赖 `require_member`。
- 所有按 id 取资源的接口，必须再校验资源属于该团队、且用户有权限。
- 非成员统一 404；角色不足 403。
- 新增团队资源时，必须补一条“跨团队访问”测试。

**禁止**：

```python
# 错：只按 id 查，不校验团队
event = db.get(Event, event_id)
```

**必须**：

```python
event = db.get(Event, event_id)
if not event or event.team_id != team_id or event.deleted_at:
    raise NotFound()
require_member(team_id, user)
```

### 6.2 私密活动：脱敏在服务端

- `visibility=private` 的活动，只有组织者和参与者能看到标题/地点/描述。
- 非参与者在活动列表/详情中**看不到该活动**；在忙闲中只看到时间段 + `busy=true`。
- 冲突结果对非参与者也不返回标题/event_id。
- 任何新增返回活动的接口，都必须走统一序列化函数；不要手写 `dict(event)`。

### 6.3 时间：存 UTC，按团队时区显示

- DB/API 一律 UTC ISO 8601。
- 全天活动：`start_at=当天 00:00`、`end_at=次日 00:00`（团队时区）。
- 不写 `datetime.now()` 无时区；用注入的 `now_utc()`。
- 跨天/跨月/23:30/00:00 必须有测试。
- 前端不自己做时区换算；用 `packages/shared` 的日期工具。

---

## 7. AI 行为准则

### 7.1 不发明需求

- 只实现 PRD 中的 P0；P1 需要明确批准。
- 不确定时**停下来问**，不要用“更完整”“更通用”为理由加功能。
- 不要自行加“管理员后台”“消息中心”“评论”“附件”“导出”“主题切换”等未列出的功能。
- 不要为了让演示好看而伪造数据/写死账号。

### 7.2 小步、可审

- 一次只做一件事；一个 PR 一个主题。
- 不顺手重构、不批量重命名、不格式化整个文件。
- 先读相邻代码，沿用现有模式；不要引入第二套风格。
- 改完给 `git diff --stat`，说明每个文件为什么动。

### 7.3 测试先行/并行

- 新逻辑先写测试或至少同时写；修 bug 先写复现用例。
- 不通过删除/跳过测试来“变绿”。
- 不 mock 掉被验证的核心逻辑（权限、冲突、脱敏、提醒）。
- 测试数据用工厂，不用生产数据。

### 7.4 不静默改契约

- 不改 API 字段名/类型/状态码；需要改走 CR + ADR。
- 不改数据库列/枚举；需要改走迁移 + CR。
- 不改 WS 消息类型；需要改同时更新前后端与文档。
- 不把 `404` 改成 `403` 或反之来“让前端好写”。

### 7.5 不碰敏感信息

- 不写死密码、token、密钥、邮箱授权码。
- 不把 `.env` 提交；只提交 `.env.example`。
- 日志不打印 Authorization、密码、完整 JWT。
- 演示账号用种子脚本生成，密码写在 `.env.example` 或演示文档，不入代码。

### 7.6 不破坏工作区

- 开始前 `git status`；有未提交改动先问。
- 禁止 `git reset --hard`、`git checkout -- .`、`git clean -fd`。
- 不 force push、不在 `main` 直接大改、不自行打 tag/改版本号。
- 不删除别人未提交的文件。

### 7.7 文档同步

- 行为/接口/表/命令变了，必须更新对应文档。
- 新增需求/变更，写 CR；新增架构决策，写 ADR。
- 不修改历史验收记录；追加新记录。

### 7.8 报告格式

每次任务结束，按以下格式回复：

```text
结论：完成/部分完成/失败
改动：
- path: 为什么改
验证：
- 命令：`...` → 结果（通过/失败/未跑）
未验证：
- 需要人工/真机确认的部分
风险/后续：
- ...
```

**没有跑过的命令，不要写“通过”。**

---

## 8. 分支与提交

```bash
git switch -c feat/event-invite   # 新功能
git switch -c fix/conflict-409    # 修 bug
git switch -c docs/ai-rules       # 文档
```

- `main` 随时可运行；合并前 `make check` 全绿 + 另一名人类 review；关键路径两人 review。
- 提交信息中文，Conventional Commits：
  - `feat(event): 支持邀请成员 (EVT-7)`
  - `fix(auth): token 过期未跳转 (AUTH-2)`
  - `docs(ai): 补充私密脱敏约束`
  - `test(conflict): 覆盖 declined 不计冲突`
- 一个提交只做一件事；不混格式化。
- 不合入未通过的测试；不提交注释掉的大段代码。

---

## 9. 评审清单

合并前至少检查：

- [ ] 需求编号对得上；没有多做/少做。
- [ ] 权限：跨团队、角色不足、私密详情。
- [ ] 时间：UTC、团队时区、全天、跨天。
- [ ] 错误：统一错误码；前端有提示；不白屏。
- [ ] 数据：迁移可跑；索引；软删除过滤。
- [ ] 测试：新增/修改有覆盖；没有 skip。
- [ ] 安全：无密钥；无注入；日志脱敏。
- [ ] UI：加载/空/错误/移动端；键盘可达。
- [ ] 文档：API/表/命令同步。

详细清单见 [`docs/ai/03-提示词与评审模板.md`](docs/ai/03-提示词与评审模板.md)。

---

## 10. 文档地图

面向使用者的产品功能与使用手册在根 [`README.md`](README.md)；开发者/共创者文档在 `docs/dev/`。

| 文档 | 用途 |
|---|---|
| `README.md` | 产品功能、使用手册、常见问题（给使用者） |
| `docs/dev/README.md` | 开发者文档索引 |
| `docs/dev/01-开发者指南.md` | 代码地图、分层、命令、测试、调试、已知缺口 |
| `docs/dev/02-共创者指南.md` | 从零搭环境、首次贡献、提交与评审流程 |
| `docs/dev/03-代码审查报告-2026-10-28.md` | 2026-10-28 集中审查的发现与修复建议 |
| `docs/00-需求与设计框架-v1.0.md` | 已冻结的范围与决策 |
| `docs/01-六周项目计划.md` | 每周任务、门禁、分工 |
| `docs/02-需求规格说明书.md` | 需求编号、用例、验收 |
| `docs/03-概要设计说明书.md` | 架构、DDL、API、算法 |
| `docs/ai/01-需求与验收约束.md` | 防止 AI 加戏/漏验收 |
| `docs/ai/02-接口与数据契约.md` | 防止静默改契约 |
| `docs/ai/03-提示词与评审模板.md` | 怎么让 AI 干活、怎么审 |
| `docs/ai/04-变更控制与追踪.md` | 需求/设计变更流程 |
| `docs/ai/05-验收与测试清单.md` | 怎么证明做完了 |
| `docs/04-验收与演示脚本.md` | 8 分钟答辩流程与兜底 |
| `demo/index.html` | 静态交互原型（虚拟数据，不是正式实现） |

---

## 11. 30 秒自检

在提交任何代码前，问自己：

1. 这属于哪个 P0 编号？
2. 非团队成员能不能读到它？
3. 私密活动会不会泄露标题？
4. 时间是不是 UTC？全天对不对？
5. 冲突有没有排除 declined 和自己？
6. 通知会不会重复？
7. 测试跑了吗？命令是什么？
8. 有没有顺手加需求/改契约/动密钥？
9. diff 能不能被人 5 分钟看懂？
10. 文档更新了吗？

**任何一项答不上来，先停下来。**
