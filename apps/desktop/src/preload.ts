import { contextBridge } from "electron";

/**
 * 只暴露白名单能力，不把 ipcRenderer 本体交给渲染进程。
 * W4 再加 notify / onNavigate；W1-08 仅提供版本与平台信息。
 */
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  getVersion: () => process.versions.electron,
});
