# CR-015：用户上传头像 + 同一活动通知合并

日期：2026-11-16。状态：用户在当前聊天明确要求“用户需要能够上传头像”，并确认“同意新增后端依赖 python-multipart、头像落 server/data/avatars/、读取允许未登录、同一活动同类通知只合并”；本次按此授权实施。人类代码评审、最终验收仍待项目成员完成（不代签）。

关联需求：新增 `AUTH-8`（上传头像）；修正 `NOTI-3/NOTI-7` 的执行口径（同一活动的同类通知只保留一条未读）；侧栏布局缺陷回归（`CAL-7` 相关，无新编号）。

## 1. 背景

1. 用户反馈团队日历页侧栏条目多时，滚动会露出 `.app-shell` 白底，AI 助手按钮被导航遮挡。
2. 用户反馈“同一个活动现在有反复通知”。根因：`notify_event()` / `invite()` / 任务指派调用 `notify()` 时未传去重键，每次编辑都追加一条；事件 15 分钟提醒的去重键里含 `start_at`，改期会再提醒一次。
3. 用户要求可以上传头像；当前只有“首字母 + 头像颜色”。

## 2. 变更内容

### 2.1 头像（AUTH-8）

| 项 | 内容 |
|---|---|
| 数据 | `users` 新增 `avatar_file`（TEXT，可空）与 `avatar_updated_at`（DATETIME，可空）；迁移 `a71c4f0d2e93`，不重建表。`avatar_color` 保留为首字母底色兜底 |
| 存储 | 文件写到 `server/data/avatars/<user_id>-<随机16位>.<jpg|png|webp>`；数据库只存文件名；目录已加入 `.gitignore`，随数据库目录一起备份 |
| 接口 | `POST /api/v1/auth/me/avatar`（multipart，字段 `file`）→ `UserOut`；`DELETE /api/v1/auth/me/avatar` → `UserOut`；读取 `GET /api/v1/users/{user_id}/avatar/{version}`（公开、带版本号、`include_in_schema=False`） |
| 字段 | `UserOut` 新增 `avatar_url: string \| null`；`TeamMemberOut` 新增 `avatar_url: string \| null`；其余字段不变 |
| 校验 | 仅 JPEG / PNG / WebP，按文件头魔数判断（不信 Content-Type）；≤ 2 MB；文件名由服务端生成，不接受用户输入；只能改自己的头像 |
| 前端 | 个人资料页“上传/更换/移除头像”；统一 `Avatar` 组件用于侧栏、顶栏、成员列表、日历资源列、活动参与者；图片加载失败自动回退首字母 |
| 依赖 | 新增 `python-multipart>=0.0.20`（FastAPI 表单/文件解析必需），经用户同意 |

### 2.2 通知合并

| 项 | 内容 |
|---|---|
| 服务端 | 合并类型：`event.invited`、`event.updated`、`event.cancelled`、`task.assigned`；合并键 `{type}:{实体id}:{user_id}`。已存在时刷新标题/时间并置为未读（最后一次变更可见），不新增行 |
| 提醒 | `event.reminder` 去重键改为 `event.reminder:{user_id}:{event_id}:15m`（去掉 `start_at`），改期不重复提醒；任务提醒的按桶去重不变 |
| 前端 | 通知中心按“活动/任务 + 类型”分组：显示最近一条与 `×N`，可展开历史；点组内任一通知操作会把整组标为已读 |
| 边界 | 未读角标仍按服务端真实未读数；`total` 仍为明细条数（不改接口字段） |

### 2.3 侧栏布局

`.app-sidebar` 限高 `100dvh` 并在内部滚动，底部用户区吸底；`.app-body/.app-content` 允许收缩；移动端抽屉保持全屏固定层。AI 助手位置夹紧在侧栏右侧工作区，窗口缩放后自动回收。

## 3. 影响分析

| 维度 | 影响 |
|---|---|
| 需求 | 新增 AUTH-8（P1，已实施）；NOTI-3/NOTI-7 不新增编号，只修正执行口径 |
| 数据 | 迁移 `a71c4f0d2e93`（仅新增两列）；头像文件新增目录 |
| 接口 | 冻结操作 43 → 45；新增错误码 `INVALID_AVATAR`（415）、`AVATAR_TOO_LARGE`（413）；`UserOut`/`TeamMemberOut` 只新增可空字段 |
| 隐私/安全 | 头像读取公开（用户确认）；只暴露图片本身与用户 id，不含其它资料；文件名不可猜测、不接受路径 |
| 备份 | 头像目录与 `server/data/` 同目录，随备份一起复制；恢复数据库后缺失的头像文件会回退首字母 |
| 测试 | 新增 `tests/test_notification_coalesce.py`（5 条）、`tests/test_avatars.py`（8 条）、前端 `ProfilePage.test.tsx`（3 条）、通知分组用例、`e2e/sidebar-layout.spec.ts`（2 条） |
| 兼容 | 旧通知不删除，前端分组展示；旧客户端忽略 `avatar_url` 不受影响 |

## 4. 取舍

- 头像不入库 blob：数据库保持轻量、备份简单；代价是需同步备份目录（已随 `server/data/` 处理）。
- 读取允许未登录：`<img>` 无法携带 Bearer；头像是公开显示信息，不含隐私内容。
- 通知合并选“原地更新”而非“删除历史”：只保留一条未读，避免列表无限堆积；已读后再次变更有新提醒，不会漏事。

## 5. 待办

- A/B 代码评审与验收签字。
- Electron/Android 壳内头像显示（复用 Web 构建，理论上无需改动）需真机确认。
