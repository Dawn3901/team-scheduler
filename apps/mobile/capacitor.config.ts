import type { CapacitorConfig } from "@capacitor/cli";

/**
 * W1-08 只做 Android 壳：构建后的 Web 产物通过 Capacitor 本地协议加载，
 * 不接本地通知（W4-07）。开发时可用 `server.url` 指向局域网 Vite，默认不启用。
 */
const config: CapacitorConfig = {
  appId: "com.teamsync.app",
  appName: "TeamSync",
  webDir: "../web/dist",
};

export default config;
