/**
 * Electron 桌面壳的受限桥接类型与导航工具。
 * 浏览器/测试环境里 window.desktop 不存在，调用方必须可选链。
 */
export interface DesktopTarget {
  teamId?: number;
  eventId?: number;
  taskId?: number;
}

export interface DesktopNotifyPayload extends DesktopTarget {
  title: string;
  body?: string;
}

export interface DesktopBridge {
  platform: string;
  getVersion: () => string;
  notify: (payload: DesktopNotifyPayload) => void;
  onNavigate: (callback: (target: DesktopTarget) => void) => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export function desktopTargetPath(target: DesktopTarget | null | undefined): string | null {
  if (!target) {
    return null;
  }
  const teamId = positiveInt(target.teamId);
  if (!teamId) {
    return null;
  }
  const eventId = positiveInt(target.eventId);
  if (eventId) {
    return `/app/teams/${teamId}/events/${eventId}`;
  }
  const taskId = positiveInt(target.taskId);
  if (taskId) {
    return `/app/teams/${teamId}/tasks?task=${taskId}`;
  }
  return `/app/teams/${teamId}`;
}

/** 只把“到点提醒”类通知弹成系统通知，邀请/改期等仍走站内 toast。 */
export function isSystemNotificationType(type: string): boolean {
  return type === "event.reminder" || type === "task.due_soon" || type === "task.overdue";
}

function positiveInt(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
