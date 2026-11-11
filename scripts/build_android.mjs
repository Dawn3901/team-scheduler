#!/usr/bin/env node
/**
 * 构建 Android debug APK。
 * 需要 JDK 17/21 + Android SDK；本脚本只负责跨平台选择 gradlew。
 * 产物：apps/mobile/todolist/app/build/outputs/apk/debug/app-debug.apk
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const cwd = join(process.cwd(), "apps/mobile/todolist");
const isWindows = process.platform === "win32";
const command = isWindows ? "gradlew.bat" : "bash";
const args = isWindows ? [":app:assembleDebug"] : ["gradlew", ":app:assembleDebug"];

const child = spawn(command, args, {
  cwd,
  stdio: "inherit",
  shell: isWindows,
});

child.on("error", (error) => {
  console.error(`无法启动 Gradle：${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
