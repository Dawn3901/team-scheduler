import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// E2E 用独立端口，避免和本地 make dev（8000/5173）抢端口或污染开发库。
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 固定 IPv4，避免 Windows 上 localhost 解析到 ::1 时 Electron/E2E 连 127.0.0.1 被拒。
    host: "127.0.0.1",
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
    },
  },
});
