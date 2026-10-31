import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
// 默认用系统 Edge，省去 150MB Chromium 下载；其他平台/CI 可切回 chromium。
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "msedge";
const device = channel === "msedge" ? devices["Desktop Edge"] : devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: channel, use: { ...device, channel } }],
  webServer: [
    {
      command: "node e2e/start-backend.mjs",
      url: "http://127.0.0.1:8010/health",
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @teamsync/web dev --host 127.0.0.1 --port 5174",
      url: "http://127.0.0.1:5174",
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_API_TARGET: "http://127.0.0.1:8010" },
    },
  ],
});
