# CR-016：团队沟通（统一消息 + 通告 + 参与者备注 + 收件箱）

日期：2026-11-17。状态：用户在本聊天逐项确认范围与四条关键决策后授权实施；人类代码评审与最终验收仍待项目成员完成（不代签）。

关联需求：新增 `MSG-1`（对象内消息）、`MSG-2`（@ 提及）、`MSG-3`（收件箱）、`ANNC-1`（团队通告）、`ANNC-2`（通告回执）、`NOTE-1`（参与者备注）、`TASK-12`（阻塞与交接说明）。均为 P1 扩展，不改动 P0 验收标准。

---

## 1. 背景

用户反馈三个场景在工具内没有落点：

1. **通告类**：Leader 要发"周五例会改到 16:00，全员必到"，现在只能发到群里，工具内无痕迹、新成员看不到群历史、组织者不知道谁看了。
2. **邀约上下文**：邀请某人时想写"带上电脑、提前 15 分钟到"这类**针对个人的要求**；现状只能塞进活动描述，全队可见且噪音大。RSVP 也没有"我会迟到 10 分钟"的表达方式。
3. **任务上下文**：指派要求、验收标准、完成说明、阻塞原因（"等设计稿"）、交接说明都无处可写，只能口口相传。

三者的共同结构是：**一条说明挂在某个对象上，跟着对象的可见性走，并在合适的时机通知该看的人**。因此本 CR 采用**一个统一消息模型**，而不是"活动留言表 + 任务留言表 + 通告表"三套实现。

## 2. 范围

### 2.1 本期做

| 项 | 内容 |
|---|---|
| 对象内消息 | `POST/GET /events/{id}/messages`、`POST/GET /tasks/{id}/messages`；`kind` = comment / note / requirement / blocker / unblock / handoff / change_reason |
| 团队通告 | 列表、发布（Admin/Owner）、详情、编辑、软删除、"点我知道了"回执、回执名单 |
| 参与者备注 | `event_participants.note`：邀请时可填、RSVP 时可填、组织者/Admin 可后续修改；仅组织者/Admin 与本人可见 |
| 收件箱 | 未回执通告 + @我 + 我负责/创建对象的新消息；统一读位 |
| @ 提及 | 仅限当前团队活跃成员；不支持 `@all` |
| 阻塞/交接 | `blocker` 必填原因；`unblock` 解除；看板显示派生"受阻"标记；交接随负责人变更写入 |

### 2.2 本期不做

- 自由聊天频道（`#general`）、一对一私信；
- 富文本/Markdown 渲染、附件与图片、表情回应；
- 消息编辑历史、撤回、@all 广播、敏感词审核；
- 邮件/Webhook 出站；
- 树形回复（只做平铺 + @）。

## 3. 关键决策（用户 2026-11-17 确认）

| 决策 | 结论 | 理由 |
|---|---|---|
| 谁能发通告 | **Admin/Owner** | 与 BR-02 "编辑团队资料/成员"同级；避免任何成员广播刷屏 |
| 邀请特别要求 | **参与者备注**（仅组织者/Admin 与本人可见，不可回复） | "对某个人的要求"不该全队可见；需要来回沟通时用评论 + @ |
| 阻塞 | **不新增 `status=blocked`** | `blocked` 字段名已被任务依赖占用（`blocked`/`blocked_by`）；改枚举会连锁影响筛选、逾期、解锁与契约 |
| 回执粒度 | 通告强制点"我知道了" | 只有确认动作才算已读，作者看到的"9/12"可信 |
| 备注后续修改 | 进一期（`PATCH /events/{id}/participants/{uid}`） | "特别要求"常常是后补的 |
| @ 范围 | 仅团队活跃成员 | 避免变成广播 IM；要全员看就发通告 |

## 4. 数据设计

```text
announcements       id, team_id, author_id, title, body, pinned, requires_ack,
                    created_at(发布时刻), updated_at, expires_at, deleted_at
announcement_acks   announcement_id, user_id, acked_at                  -- 复合主键
messages            id, team_id, author_id, target_type, target_id, kind,
                    body, created_at, deleted_at
                    index (team_id, target_type, target_id, id)
message_mentions    message_id, user_id                                 -- 复合主键
read_cursors        user_id, target_type, target_id, last_read_at       -- 复合主键
event_participants  + note TEXT NULL                                    -- 既有表加列
```

- 迁移只加表 + 加一列，不重建既有表；可 `downgrade -1` 回退。
- 不设 `published_at`：`created_at` 即发布时刻（避免冗余列）。
- 消息分页用 `before_id` 游标（新消息持续插入，`offset` 会错位）；通告列表仍用 `limit/offset`。
- 未读只有一套：对象级 `read_cursors`（收件箱与圆点）；通告未读由 `announcement_acks` 缺失定义（回执专用）。

## 5. 接口（契约 45 → 59）

| # | 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|---|
| 46 | GET | `/teams/{team_id}/announcements` | 成员 | 置顶优先、未过期优先、分页 |
| 47 | POST | `/teams/{team_id}/announcements` | Admin/Owner | 发布（`requires_ack` 默认 true） |
| 48 | GET | `/announcements/{aid}` | 成员 | 详情 + 我的回执状态 + 回执数 |
| 49 | PATCH | `/announcements/{aid}` | 作者/Admin | 改标题/正文/置顶/失效时间 |
| 50 | DELETE | `/announcements/{aid}` | 作者/Admin | 软删除 |
| 51 | POST | `/announcements/{aid}/ack` | 成员 | "我知道了"，幂等 |
| 52 | GET | `/announcements/{aid}/receipts` | 作者/Admin | 已回执/未回执名单 |
| 53 | GET | `/events/{event_id}/messages?before_id&limit` | 可见者 | 游标分页，按时间正序返回 |
| 54 | POST | `/events/{event_id}/messages` | 可见者 | 可带 `mention_user_ids` |
| 55 | GET | `/tasks/{task_id}/messages?before_id&limit` | 成员 | 同上 |
| 56 | POST | `/tasks/{task_id}/messages` | 成员 | `kind` 限 comment/note/requirement/blocker/unblock/handoff |
| 57 | PATCH | `/events/{event_id}/participants/{user_id}` | 组织者/Admin | 编辑/清空参与者备注 |
| 58 | POST | `/read-marks` | 成员 | `{target_type,target_id}` 推进读位，204 |
| 59 | GET | `/inbox` | 成员 | 三类聚合 |

字段变更（不新增端点）：

- `POST /events/{id}/participants` 请求增可选 `note`（应用到本次被邀请者）；
- `PATCH /events/{id}/rsvp` 请求增可选 `note`（写本人备注）；
- `EventOut.participants[]` 增 `note`（**按可见性裁剪**：组织者/Admin 看全部，其余人只看自己）；
- `TaskOut` 增派生 `waiting_reason`（最新 `blocker` 且无更晚 `unblock` 时非空）。

新增通知类型：`announcement.published`、`message.mentioned`、`message.created`。合并键沿用 CR-015：`{type}:{目标}:{user_id}`，同一对象同一人只留一条未读；同一消息同时命中 @ 与"我负责"时**只发 mentioned**。

新增错误码：`INVALID_MENTION`（422，@ 了非活跃成员或跨团队用户）。

**WS 不变**：写操作后沿用现有 `calendar.changed` / `notification.created` 信号（只带 team_id），客户端失效重取；不新增消息类型，避免契约再扩一层。

## 6. 影响分析

| 维度 | 影响 |
|---|---|
| 需求 | 新增 7 条 P1（MSG-1..3、ANNC-1..2、NOTE-1、TASK-12）；P0 82 条不变 |
| 数据 | 4 张新表 + `event_participants.note` 一列；迁移可降级 |
| 接口 | 冻结操作 45 → 59；`EventOut`/`TaskOut` 只新增可空字段 |
| 权限/隐私 | 消息可见性只走对象规则（`can_view` / 任务归属 / 团队成员）；备注是**字段级**可见性，最易泄露，需专门测试 |
| 通知 | 新增 3 类；合并键与 CR-015 同源，避免通知爆炸 |
| 前端 | 新增讨论组件、通告页、收件箱；活动详情与任务看板接线；侧栏两个入口 |
| 测试 | pytest 约 24 条、Vitest 约 9 条、Playwright 4 条 |
| 排期 | 约 13.5 人日；占用 P1 预算，不挤占 P0 验收与 W6 缓冲 |
| 产品定位 | 只做"对象内沟通"，不含自由聊天；`docs/00 §2.4` 的"不做 IM"仍然成立 |

## 7. 取舍与替代方案

| 方案 | 结论 |
|---|---|
| 三套独立表（活动留言/任务留言/通告） | 拒绝：权限、通知、UI 各写三份，行为必然不一致 |
| 只做通告，不做评论 | 拒绝：B、C 两个场景无处落点 |
| 用 `status=blocked` 表达阻塞 | 拒绝：与依赖 `blocked` 语义冲突，且改枚举影响面大 |
| 评论全量通知 | 拒绝：会重复"通知爆炸"问题；只 @ 与我负责的对象进通知 |
| 定向消息（audience 维度） | 拒绝：可见性矩阵翻倍；用"参与者备注 + @ 评论"覆盖 |

## 8. 待办

- A/B 代码评审与验收签字；重点看备注字段级可见性与私密活动评论。
- 二期如需频道/私信，另立 CR。

---

## 9. 2026-11-17 用户反馈修正（同 CR 内追加）

用户在试用后提出 4 个问题与 2 个设计疑问，处理如下（均不新增端点、不改表）：

| # | 反馈 | 处理 |
|---|---|---|
| 1 | 新建活动时没有 @ 功能 | 活动表单的“给参与者的说明”改为支持手打 @ 的多行输入；提交时写一条 `note` 消息并带上 `mention_user_ids`，被 @ 的成员收到提及通知 |
| 2 | 讨论里的 @ 只能点按钮，手打不生效 | 新增 `MentionTextarea`：输入 `@` 弹出成员候选，支持上下键/回车/Esc；删掉已插入的名字会同步撤销该提及，避免误通知 |
| 3 | 收件箱/通知只显示活动标题，看不到内容 | 消息通知的 `title` 改为“作者：内容摘要（≤60 字）”，`body` 存“在「对象标题」中”；收件箱把消息正文作为主信息、对象名降为副标题 |
| 4 | 发布者还要点“我知道了” | 发布通告时自动为作者写一条 `announcement_acks`，作者默认已确认，回执统计从 1 开始 |
| 5 | 活动讨论里“讨论/说明”区分无意义 | 活动讨论只保留“讨论”一种输入（去掉下拉）；系统写入的 `note`/`change_reason` 仍按类型标签展示 |
| 6 | 收件箱与通知中心功能重叠 | 已合并为「通知」页双标签（待处理 / 全部动态），旧链接重定向 |

### 关于“收件箱 vs 通知中心”

两者**数据来源与目的不同**，但当前入口确实容易混淆：

- 通知中心 = **事件流**（发生了什么）：邀请、改期、指派、提醒、@、新通告，全部落库并按对象合并。它是"回看"用的。
- 收件箱 = **待办队列**（需要我做什么）：未确认的通告、@我且我没读的消息、我负责/组织的对象里的新消息。它只显示"未处理"，打开即消失。

重合点在"被 @"：同一条消息既进通知流也进收件箱。若要合并，建议把「通知中心」做成单页双标签（待处理 / 全部动态），删除独立收件箱入口；这属于信息架构调整，需要产品确认后再做，本次未动。

### 收件箱与通知中心：已合并（用户 2026-11-17 确认）

保留一个入口「通知」（`/app/notifications`），页内两个标签：

- **全部动态**（默认）：原通知中心——按对象合并的事件流，支持“仅显示未读”“全部已读”和历史展开。
  默认放这里，是因为邀请、改期这类通知要靠点进去处理（与合并前路径一致）。
- **待处理**：原收件箱内容——未确认通告、@我、我负责/组织对象的新消息；打开即推进读位；标签上带条数。

旧链接 `/app/inbox` 重定向到「通知」的待处理标签；侧栏只保留一个「通知」入口，角标 = 待处理条数。
删除 `pages/InboxPage.tsx`；接口 `GET /inbox` 与 `POST /read-marks` 不变，契约不受影响。

### 影响

- 后端：`notify()` 增可选 `body`；消息通知文案改为内容优先；通告创建自动回执。无迁移。
- 前端：`MentionTextarea`、活动表单备注、收件箱/通知展示、活动讨论去掉“说明”。
- 测试：pytest +2（发布者免确认、通知内容是摘要），Vitest +2（手打 @、撤销 @），E2E +1（新建活动 @）。

### 通知类型展示名修正（2026-11-17）

新增的三类通知在通知页直接显示了内部代码（`message.mentioned` / `announcement.published`），已修：
补 `有人 @ 你` / `新消息` / `新通告` 展示名，同时补上原先遗漏的 `task.updated`（任务变更）；
未知类型统一显示“通知”，不再回退到原始代码。同一条通告的多条通知也按对象合并成一组。
新增 `noticeGroups.test.ts` 断言“后端 12 种类型都有中文名、未知类型有兜底”，E2E 额外断言通知页不出现 `message.mentioned`。
