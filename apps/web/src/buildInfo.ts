declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

// 构建期由 vite define 替换为字面量；typeof 兜底避免测试/旧产物未定义时报错。
const injected = (get: () => unknown): string | undefined => {
  try {
    const value = get();
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
};

export interface BuildInfo {
  version: string;
  commit: string;
  buildTime: string;
}

function fallback(value: string | undefined): string {
  return typeof value === "string" && value ? value : "未知";
}

/** 版本号来自 apps/web/package.json，提交号与构建时间来自构建期注入。 */
export const buildInfo: BuildInfo = {
  version: fallback(injected(() => typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : undefined)),
  commit: fallback(injected(() => typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : undefined)),
  buildTime: fallback(
    injected(() => typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : undefined),
  ),
};

export function formatBuildTime(iso: string): string {
  if (iso === "未知") return iso;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("zh-CN", { hour12: false });
}
