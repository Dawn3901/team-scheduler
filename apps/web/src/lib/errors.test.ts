import { ApiError } from "@teamsync/shared";
import { describe, expect, it } from "vitest";

import { fieldErrorMap, friendlyMessage } from "./errors";

describe("friendlyMessage", () => {
  it("maps forbidden and not found", () => {
    expect(friendlyMessage(new ApiError(403, "FORBIDDEN", "没有权限"))).toBe(
      "没有权限执行这个操作",
    );
    expect(friendlyMessage(new ApiError(404, "NOT_FOUND", "资源不存在"))).toBe(
      "资源不存在或无权访问",
    );
  });

  it("keeps 422 business messages", () => {
    expect(
      friendlyMessage(
        new ApiError(422, "UNPROCESSABLE_ENTITY", "结束时间必须晚于开始时间"),
      ),
    ).toBe("结束时间必须晚于开始时间");
  });

  it("maps time conflict and generic conflict", () => {
    expect(
      friendlyMessage(new ApiError(409, "TIME_CONFLICT", "所选成员已有安排")),
    ).toBe("所选成员已有安排");
    expect(friendlyMessage(new ApiError(409, "CONFLICT", ""))).toBe(
      "操作冲突，请刷新后重试",
    );
  });

  it("hides validation details behind a friendly message", () => {
    expect(friendlyMessage(new ApiError(400, "VALIDATION_ERROR", "请求参数不合法"))).toBe(
      "请检查填写内容",
    );
  });
});

describe("fieldErrorMap", () => {
  it("maps server validation errors to field messages", () => {
    const error = new ApiError(400, "VALIDATION_ERROR", "请求参数不合法", {
      errors: [
        { loc: ["body", "password"], type: "string_too_short", msg: "too short" },
        { loc: ["body", "display_name"], type: "missing", msg: "required" },
      ],
    });

    expect(fieldErrorMap(error)).toEqual({
      password: "内容太短",
      display_name: "该项必填",
    });
  });

  it("maps details.field from business errors", () => {
    const error = new ApiError(422, "UNPROCESSABLE_ENTITY", "成员编号格式不正确", {
      field: "member_ids",
    });

    expect(fieldErrorMap(error)).toEqual({ member_ids: "成员编号格式不正确" });
  });

  it("keeps the existing email conflict mapping", () => {
    const error = new ApiError(409, "CONFLICT", "邮箱已被使用", { field: "email" });
    expect(fieldErrorMap(error)).toEqual({ email: "邮箱已被使用" });
  });
});
