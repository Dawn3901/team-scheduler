import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  protocol,
  shell,
  Tray,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 桌面壳：
 * - 开发：设置 TEAMSYNC_WEB_URL 或传 --web-url=http://127.0.0.1:5173 走 Vite HMR。
 * - 默认：通过 app:// 协议加载 apps/web/dist，不依赖本地 Web 服务。
 * - W4：托盘、关闭到托盘、系统通知、点击通知回到对应活动/任务。
 * 不碰本地数据库；通知内容由渲染进程按站内通知产生，主进程只负责展示与导航。
 */
const webUrlArg = process.argv.find((arg) => arg.startsWith("--web-url="));
const DEV_URL = webUrlArg?.slice("--web-url=".length) ?? process.env.TEAMSYNC_WEB_URL;
const SMOKE_TEST = process.argv.includes("--smoke-test");
const APP_ORIGIN = "app://teamsync";
const APP_NAME = "TeamSync（同频）";
const WEB_DIST = path.join(__dirname, "..", "..", "web", "dist");
const TRAY_ICON = path.join(__dirname, "..", "assets", "tray.png");
const NOTIFY_CHANNEL = "teamsync:notify";
const NAVIGATE_CHANNEL = "teamsync:navigate";

if (process.platform === "win32") {
  // Windows 通知需要稳定的 AppUserModelID，否则可能不显示或归到 electron.exe。
  app.setAppUserModelId("com.teamsync.desktop");
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayError: string | null = null;
let isQuitting = false;

interface NavigateTarget {
  teamId?: number;
  eventId?: number;
  taskId?: number;
}

interface DesktopNotification {
  title: string;
  body?: string;
  target: NavigateTarget;
}

/** 把 app://teamsync/... 映射到 apps/web/dist；找不到文件时回退 index.html（SPA 路由）。 */
async function serveWebAsset(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "");
  const filePath = path.join(WEB_DIST, relative || "index.html");

  if (filePath !== WEB_DIST && !filePath.startsWith(WEB_DIST + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const response = await net.fetch(pathToFileURL(filePath).toString());
    if (response.ok) {
      return response;
    }
  } catch {
    // 文件不存在或不是文件：回退到 SPA 入口。
  }

  return net.fetch(pathToFileURL(path.join(WEB_DIST, "index.html")).toString());
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: !SMOKE_TEST,
    backgroundColor: "#f6f7fb",
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const allowedPrefix = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
    }
  });

  window.on("close", (event) => {
    // W4：关闭窗口最小化到托盘；真正退出走托盘菜单/系统退出。
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const target = DEV_URL ?? `${APP_ORIGIN}/`;
  window.loadURL(target).catch((error: unknown) => {
    if (!SMOKE_TEST) {
      dialog.showErrorBox(
        "无法打开 TeamSync",
        `加载 ${target} 失败。开发模式请先启动前端（make dev）；本地构建请先执行 pnpm --filter @teamsync/web build。\n\n${String(error)}`,
      );
    }
    app.exit(1);
  });

  return window;
}

function showWindow(): void {
  if (!app.isReady()) {
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function hideWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function sendNavigate(target: NavigateTarget): void {
  showWindow();
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(NAVIGATE_CHANNEL, target);
    }
  };
  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

function createTray(): void {
  if (tray) {
    return;
  }
  try {
    const image = nativeImage.createFromPath(TRAY_ICON);
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示主窗口", click: showWindow },
        { label: "隐藏到托盘", click: hideWindow },
        { type: "separator" },
        {
          label: "退出",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", () => {
      if (mainWindow?.isVisible()) {
        hideWindow();
      } else {
        showWindow();
      }
    });
  } catch (error) {
    // 无桌面环境的 CI/冒烟环境可能创建失败；不阻塞 Web 使用。
    trayError = String(error);
    console.error("TRAY_FAILED", error);
  }
}

function positiveInt(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function sanitizeNotification(payload: unknown): DesktopNotification | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const raw = payload as Record<string, unknown>;
  const title = cleanText(raw.title, 120);
  if (!title) {
    return null;
  }
  return {
    title,
    body: cleanText(raw.body, 300),
    target: {
      teamId: positiveInt(raw.teamId),
      eventId: positiveInt(raw.eventId),
      taskId: positiveInt(raw.taskId),
    },
  };
}

function showSystemNotification(payload: DesktopNotification): void {
  if (!Notification.isSupported()) {
    return;
  }
  const notification = new Notification({
    title: payload.title,
    body: payload.body ?? "",
  });
  notification.on("click", () => sendNavigate(payload.target));
  notification.show();
}

function registerIpc(): void {
  ipcMain.on(NOTIFY_CHANNEL, (event, payload: unknown) => {
    // 只接受主窗口渲染进程的请求，避免任意 WebContents 伪造系统通知。
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return;
    }
    const notification = sanitizeNotification(payload);
    if (notification) {
      if (SMOKE_TEST) {
        console.log(`NOTIFY_IPC title=${notification.title}`);
      }
      showSystemNotification(notification);
    }
  });
}

async function waitForLoad(window: BrowserWindow): Promise<void> {
  if (window.webContents.isLoading()) {
    await new Promise<void>((resolve, reject) => {
      window.webContents.once("did-finish-load", () => resolve());
      window.webContents.once("did-fail-load", (_event, code, description) => {
        reject(new Error(`did-fail-load ${code}: ${description}`));
      });
    });
  }
}

async function waitForLoginPage(window: BrowserWindow, timeoutMs = 8_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const visible = await window.webContents.executeJavaScript(
      'document.body.innerText.includes("登录同频")',
    );
    if (visible) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("登录页在超时内没有渲染");
}

async function runSmokeTest(window: BrowserWindow): Promise<void> {
  await waitForLoad(window);
  await waitForLoginPage(window);

  const prefix = "--smoke-screenshot=";
  const screenshotArg = process.argv.find((arg) => arg.startsWith(prefix));
  const screenshotPath = screenshotArg?.slice(prefix.length);
  if (screenshotPath) {
    const image = await window.webContents.capturePage();
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, image.toPNG());
  }

  const bridge = await window.webContents.executeJavaScript(
    '({notify: typeof window.desktop?.notify, navigate: typeof window.desktop?.onNavigate})',
  );

  if (process.argv.includes("--smoke-notify")) {
    await window.webContents.executeJavaScript(
      'window.desktop.notify({title:"TeamSync 冒烟通知", body:"W4 系统通知链路", teamId:1, eventId:1})',
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    console.log(`NOTIFY_SUPPORTED=${Notification.isSupported()}`);
  }

  await window.webContents.executeJavaScript(
    'window.__nav = null; window.desktop.onNavigate((target) => { window.__nav = target; });',
  );
  sendNavigate({ teamId: 1, eventId: 2 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const nav = await window.webContents.executeJavaScript('window.__nav');
  console.log(`NAVIGATE_OK=${Boolean(nav && nav.eventId === 2 && nav.teamId === 1)}`);

  window.close();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const hidden = !mainWindow?.isVisible();
  showWindow();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const shown = Boolean(mainWindow?.isVisible());

  console.log(
    `SMOKE_OK url=${window.webContents.getURL()} loginPageRendered=true tray=${Boolean(tray)} trayError=${trayError ?? ""} bridge=${JSON.stringify(bridge)} trayToggleHidden=${hidden} trayToggleShown=${shown}`,
  );
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("will-quit", () => {
    tray?.destroy();
    tray = null;
  });

  app.on("window-all-closed", () => {
    // 有托盘时常驻；托盘创建失败则保持旧行为，关窗即退出。
    if (!tray || isQuitting) {
      app.quit();
    }
  });

  registerIpc();

  app.whenReady().then(async () => {
    protocol.handle("app", serveWebAsset);
    createTray();
    mainWindow = createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      } else {
        showWindow();
      }
    });

    if (SMOKE_TEST) {
      try {
        await runSmokeTest(mainWindow);
      } catch (error) {
        console.error("SMOKE_FAILED", error);
        app.exit(1);
      }
    }
  });
}
