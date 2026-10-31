import { ApiError } from "@teamsync/shared";

/** 把接口错误翻译成页面可展示的中文；未知错误不泄露内部信息。 */
export function friendlyMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "操作失败，请重试";
  }

  switch (error.code) {
    case "NETWORK_ERROR":
      return "无法连接服务器，请确认后端已启动";
    case "TIMEOUT":
      return "请求超时，请重试";
    case "INVALID_CREDENTIALS":
      return "用户名或密码错误";
    case "UNAUTHORIZED":
      return "登录已过期，请重新登录";
    case "FORBIDDEN":
      return "没有权限执行这个操作";
    case "NOT_FOUND":
      return "资源不存在或无权访问";
    case "INVITE_CODE_INVALID":
      return "邀请码无效或已失效";
    default:
      return error.message || "操作失败，请重试";
  }
}

/** 把可归属到表单字段的错误映射到字段级提示。 */
export function fieldErrorMap(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) {
    return {};
  }

  if (error.code === "USERNAME_TAKEN") {
    return { username: "用户名已被使用" };
  }
  if (error.code === "INVALID_PASSWORD") {
    return { password: error.message };
  }
  if (error.code === "CONFLICT") {
    const field = (error.details as { field?: unknown } | undefined)?.field;
    if (field === "email") {
      return { email: "邮箱已被使用" };
    }
  }
  return {};
}
