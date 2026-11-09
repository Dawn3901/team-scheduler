# CR-009 / ADR-002 · 四项协作拓展实施

日期：2026-11-09。授权：用户在本聊天明确要求直接实现先前讨论的四项拓展；该授权覆盖必要的业务表、API 和页面扩展。人类代码评审及最终验收仍待进行，不代签。

关联 AVAIL-6、EVT-10、RSVP-6，新增 TASK-11（任务前置依赖）。原 P0 回归继续作为门禁。本次不增加第三方依赖。

## 范围与规则

1. AVAIL-6 沿用 CR-006：工作时段默认团队本地 09:00–18:00、周末可选、15 分钟步长，时长15–480分钟、缓冲0–60分钟、范围≤31天；必到全部空闲才推荐。评分0.7+0.3×可选出席比例，同分取更早；返回至多3个互不重叠候选，附出席名单与原因。推荐不预订，保存活动时再次检测冲突。团队范围内所有有效活动（含私密、全天）计忙，declined不计；不披露活动标题/ID。
2. EVT-10 覆盖 CR-008 原暂缓决定：每周/每双周，count/until二选一，最多52次且一年内，全部实例一次事务物化。按团队墙上时间保持跨DST钟点，遇不存在或歧义的本地时间拒绝并提示调整。实例保留series_id与original_start；取消不复活。支持this/future/all编辑或取消/删除，future/all仅影响未开始、未取消、未删除实例；this保留P0开始时间限制。修改时间按选中实例与新时间的本地偏移作用于范围内各实例。所有实例检测冲突，失败整批回滚，强制保存需显式ignore_conflicts。不做无限重复或复杂RRULE。
3. RSVP-6 沿用 CR-007：真实改变时间/地点后accepted/tentative回pending、清回应时间、标记待重新确认；组织者、declined保持；已pending不重复通知。使用event.updated；重复活动逐实例独立处理。增加needs_confirmation标记以区分初次邀请和重新确认，新增邀请/重新邀请及回应时清除。不接邮件，不保留历史版本。
4. TASK-11：新增task_dependencies边表，任务创建/编辑通过dependency_ids完整替换前置任务。只允许同队未删除任务；拒绝自依赖、重复边归一化、循环依赖及跨队引用。前置未全部done时不可进入doing/done；已有doing/done任务不得改成被阻塞状态，需先重开。前置任务有doing/done下游时不可重开；有关联的未删除下游时不可删前置。截止早于前置仅返回warning，不强改日期。图接口返回团队全部有效任务及边，页面提供图和依赖清单。权限保持创建者/Admin编辑依赖、负责人/创建者/Admin改状态。

## 数据 / 接口

- event_series规则表；events增加series_id/original_start；event_participants增加needs_confirmation默认false；task_dependencies(task_id,depends_on_id)唯一复合主键、反向索引、自边CHECK。
- 新GET /teams/{team_id}/availability/suggestions，参数同CR-006。
- POST /teams/{team_id}/events支持recurrence={frequency,count|until}；保留单个活动响应，附series_id与series_count，列表仍普通实例。
- PATCH /events/{id}增加scope=this|future|all（默认this）；DELETE对应scope查询；取消仍PATCH status=cancelled。
- GET /teams/{team_id}/tasks/dependency-graph；TaskCreate/Patch增加dependency_ids；Task输出增加dependency_ids/blocked_by/blocked/dependency_warnings。
- 活动/参与者输出needs_confirmation，活动增加my_needs_confirmation。
- 新错误409 TASK_BLOCKED/DEPENDENCY_IN_USE，422 DEPENDENCY_CYCLE/INVALID_DEPENDENCY/INVALID_RECURRENCE；沿用其余错误码。
- 沿用calendar.changed/task.updated/event.updated等WS消息，不新增类型；批量修改使整个团队查询失效。

## 验证

后端覆盖算法评分/隐私/时区/跨团队、批量创建及修改回滚、三种scope/取消不复活、重新确认通知幂等、DAG循环/阻塞/重开/删除/权限。迁移空库及旧head升级、降级、drift。前端typecheck/lint/组件或E2E覆盖四项入口和主流程。Windows实机仍单独标注。
