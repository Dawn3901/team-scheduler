# CR-001 · 补齐既定 P0 的 server 与 Web 实现

- 日期：2026-11-02
- 范围：AUTH-4、TEAM-5/6/7/10、CAL-1..8、EVT-1..9/11/12、RSVP-1..5、AVAIL-1..5、TASK-1..8、NOTI-1..7/Web 展示、RT-1..6、OPS-2/3/4/8。
- 用户授权：本聊天明确允许“按现有设计补齐表、迁移和 API”，并明确允许添加 `react-big-calendar`、`date-fns`、`@types/react-big-calendar`。
- 数据：新增文档已有的 events/event_participants/tasks/notifications，迁移 `e01de950f6a1`；旧表不删不改。升级/降级/重升级及 Alembic drift 检查由测试覆盖。
- API：沿用 docs/03、docs/ai/02 已定义端点；未增加 P1 端点或修改现有认证/团队响应。
- Web：替换四个占位入口，增加活动详情、通知与资料页面；日历按需加载。
- 实时：FastAPI WebSocket；同一用户多端；活动详情仅发给可见成员，其余仅 `calendar.changed`；HTTP 重取。
- 调度：使用 Python 自带 asyncio 单进程每 60 秒扫描，保持既定扫描/去重语义，未增加 APScheduler 依赖。异常记录后下轮重试。
- 风险与复核：权限、迁移、时区、私密脱敏、提醒需两位项目成员 review；本记录不代替人类最终验收。
- 排除：密码修改、团队资料/时区编辑、重复活动、评论、导出等 P1；Electron/Android 原生通知不属于本次 server/Web 任务。
