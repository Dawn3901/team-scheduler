/**
 * Playwright 的后端启动器：每次运行用全新的临时 SQLite 库，先迁移再起 uvicorn。
 * 这样 E2E 不污染 server/data/teamsync.db，也不要求先跑 make dev。
 *
 * 运行环境：与 node_modules 同平台（当前仓库的 node_modules 是 Windows 构建，
 * 请在 Windows 终端执行 pnpm test:e2e）。Linux/WSL 需先重新安装依赖，或用
 * TEAMSYNC_PYTHON 指向可执行的 Python 3.12+。
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");
const dbPath = join(serverDir, "data", "e2e.db");
const isWindows = process.platform === "win32";
const defaultPython = join(
  serverDir,
  ".venv",
  isWindows ? "Scripts" : "bin",
  isWindows ? "python.exe" : "python",
);
const python = process.env.TEAMSYNC_PYTHON ?? defaultPython;

if (!existsSync(python)) {
  console.error(
    `找不到 Python 解释器：${python}\n` +
      "请先执行 make setup，或用 TEAMSYNC_PYTHON 指定 Python 3.12+。",
  );
  process.exit(1);
}

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const env = {
  ...process.env,
  SECRET_KEY: process.env.SECRET_KEY ?? "e2e-secret-key-with-at-least-32-bytes",
  DATABASE_URL: `sqlite:///${dbPath.replace(/\\/g, "/")}`,
  LOG_LEVEL: "WARNING",
};

const children = new Set();

function start(args) {
  const child = spawn(python, args, { cwd: serverDir, env, stdio: "inherit" });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function shutdown(code) {
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

const migrate = start(["-m", "alembic", "upgrade", "head"]);
migrate.on("exit", (code) => {
  if (code !== 0) {
    console.error("E2E 数据库迁移失败");
    shutdown(code ?? 1);
    return;
  }

  const server = start([
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8010",
  ]);
  server.on("exit", (code) => shutdown(code ?? 0));
});
