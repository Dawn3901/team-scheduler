import { contextBridge, ipcRenderer } from "electron";

/**
 * 只暴露白名单能力，不把 ipcRenderer 本体交给渲染进程。
 * W4：通知展示 + 点击系统通知后的页面导航；其余能力仍走 HTTP/WS。
 */
interface NavigateTarget {
  teamId?: number;
  eventId?: number;
  taskId?: number;
}

interface NotifyPayload extends NavigateTarget {
  title: string;
  body?: string;
}

let navigateCallback: ((target: NavigateTarget) => void) | null = null;

ipcRenderer.on("teamsync:navigate", (_event: Electron.IpcRendererEvent, target: NavigateTarget) => {
  navigateCallback?.(target);
});

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  getVersion: () => process.versions.electron,
  notify: (payload: NotifyPayload) => {
    ipcRenderer.send("teamsync:notify", payload);
  },
  onNavigate: (callback: (target: NavigateTarget) => void) => {
    navigateCallback = typeof callback === "function" ? callback : null;
  },
});
