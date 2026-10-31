import { app, BrowserWindow, dialog, net, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * W1-08 桌面壳：打开窗口并加载登录页。
 * - 开发：设置 TEAMSYNC_WEB_URL 或传 --web-url=http://127.0.0.1:5173 走 Vite HMR。
 * - 默认：通过 app:// 协议加载 apps/web/dist，不依赖本地 Web 服务。
 * 托盘、系统通知与打包在 W4/W5 接入；这里不碰本地数据库。
 */
const webUrlArg = process.argv.find((arg) => arg.startsWith("--web-url="));
const DEV_URL = webUrlArg?.slice("--web-url=".length) ?? process.env.TEAMSYNC_WEB_URL;
const SMOKE_TEST = process.argv.includes("--smoke-test");
const APP_ORIGIN = "app://teamsync";
const WEB_DIST = path.join(__dirname, "..", "..", "web", "dist");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow: BrowserWindow | null = null;

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
    title: "TeamSync（同频）",
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

  console.log(`SMOKE_OK url=${window.webContents.getURL()} loginPageRendered=true`);
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    protocol.handle("app", serveWebAsset);
    mainWindow = createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
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

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
