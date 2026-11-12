import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function readVersion(): string {
  try {
    return JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

function readCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildInfo = {
  version: readVersion(),
  commit: readCommit(),
  time: new Date().toISOString(),
};

// E2E 用独立端口，避免和本地 make dev（8000/5173）抢端口或污染开发库。
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  // 版本号/构建信息只来自构建期，不在运行时猜测。
  define: {
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __APP_COMMIT__: JSON.stringify(buildInfo.commit),
    __APP_BUILD_TIME__: JSON.stringify(buildInfo.time),
  },
  server: {
    port: 5173,
    // 固定 IPv4，避免 Windows 上 localhost 解析到 ::1 时 Electron/E2E 连 127.0.0.1 被拒。
    host: "127.0.0.1",
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true, ws: true },
      "/health": { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
});
