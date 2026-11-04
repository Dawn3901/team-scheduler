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
    case "VALIDATION_ERROR":
      return "请检查填写内容";
    case "UNPROCESSABLE_ENTITY":
      return error.message || "请求无法处理";
    case "TIME_CONFLICT":
      return error.message || "所选成员已有安排";
    case "CONFLICT":
      return error.message || "操作冲突，请刷新后重试";
    case "RATE_LIMITED":
      return "操作太频繁，请稍后再试";
    case "INTERNAL_ERROR":
      return "服务器开小差了，请稍后重试";
    default:
      return error.message || "操作失败，请重试";
  }
}

function detailsRecord(error: ApiError): Record<string, unknown> {
  const details = error.details;
  return details !== null && typeof details === "object"
    ? (details as Record<string, unknown>)
    : {};
}

function validationMessage(type: string): string {
  if (type === "missing") {
    return "该项必填";
  }
  if (type.includes("too_short")) {
    return "内容太短";
  }
  if (type.includes("too_long")) {
    return "内容太长";
  }
  if (type.includes("datetime")) {
    return "时间格式不正确";
  }
  if (type.includes("email")) {
    return "邮箱格式不正确";
  }
  if (type === "value_error") {
    return "格式不正确";
  }
  return "填写内容不合法";
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

  const details = detailsRecord(error);
  if (error.code === "CONFLICT" && details.field === "email") {
    return { email: "邮箱已被使用" };
  }

  const fieldErrors: Record<string, string> = {};
  if (typeof details.field === "string" && details.field !== "") {
    fieldErrors[details.field] = error.message;
  }

  const rawErrors = details.errors;
  if (Array.isArray(rawErrors)) {
    for (const raw of rawErrors) {
      if (raw === null || typeof raw !== "object") {
        continue;
      }
      const item = raw as { loc?: unknown; type?: unknown };
      const loc = Array.isArray(item.loc) ? item.loc : [];
      const field = [...loc]
        .reverse()
        .find((part): part is string => typeof part === "string" && part !== "body");
      if (field === undefined) {
        continue;
      }
      fieldErrors[field] = validationMessage(
        typeof item.type === "string" ? item.type : "",
      );
    }
  }

  return fieldErrors;
}
