import type { Notice } from "@teamsync/shared";

/**
 * 同一活动（或任务）的同类通知合并成一组：
 * 服务端已对 event.invited / event.updated / event.cancelled / task.assigned
 * 做去重，这里再兜住历史数据与不同时间桶的提醒（如逾期每日一条）。
 */
export interface NoticeGroup {
  key: string;
  latest: Notice;
  items: Notice[];
  title: string;
  typeLabel: string;
  target: string | null;
}

function targetKey(notice: Notice): string | null {
  const { team_id, event_id, task_id } = notice.payload;
  if (event_id) return `event:${team_id ?? 0}:${event_id}`;
  if (task_id) return `task:${team_id ?? 0}:${task_id}`;
  return null;
}

/** 合并键：事件/任务 + 类型；没有目标的普通通知各自成组。 */
export function groupKey(notice: Notice): string {
  const target = targetKey(notice);
  return target ? `${target}:${notice.type}` : `notice:${notice.id}`;
}

/** 去掉「」标题与正文中的时间差异，用于判断标题在反复变更中是否已变化。 */
function cleanTitle(title: string): string {
  return title.replace(/[「」]/g, "").trim();
}

export function groupLabel(type: string): string {
  const labels: Record<string, string> = {
    "event.invited": "活动邀请",
    "event.updated": "活动变更",
    "event.cancelled": "活动取消",
    "event.reminder": "活动提醒",
    "rsvp.updated": "回应更新",
    "task.assigned": "任务指派",
    "task.due_soon": "即将到期",
    "task.overdue": "任务逾期",
  };
  return labels[type] ?? type;
}

export function groupNotices(items: Notice[]): NoticeGroup[] {
  // 输入已按时间倒序；保持首次出现的顺序即“最近在前”。
  const order: string[] = [];
  const buckets = new Map<string, Notice[]>();
  for (const notice of items) {
    const key = groupKey(notice);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(notice);
  }
  return order.map(key => {
    const list = buckets.get(key)!;
    const latest = list[0];
    const titles = new Set(list.map(n => cleanTitle(n.title)));
    return {
      key,
      latest,
      items: list,
      title: latest.title,
      typeLabel: groupLabel(latest.type),
      target: titles.size > 1 ? Array.from(titles).join(" / ") : null,
    };
  });
}

/** 只保留未读时，一组里只要有一条未读就整组显示。 */
export function groupUnread(group: NoticeGroup): number {
  return group.items.filter(n => !n.read_at).length;
}
