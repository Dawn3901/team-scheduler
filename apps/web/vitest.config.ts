import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  // 测试里固定构建信息，避免快照/断言依赖真实提交。
  define: {
    __APP_VERSION__: JSON.stringify("0.1.0-test"),
    __APP_COMMIT__: JSON.stringify("testcommit"),
    __APP_BUILD_TIME__: JSON.stringify("2026-11-12T00:00:00.000Z"),
  },
});
