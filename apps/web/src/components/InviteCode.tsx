import { useState } from "react";

interface InviteCodeProps {
  code: string;
}

type CopyState = "idle" | "copied" | "failed";

export function InviteCode({ code }: InviteCodeProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copy = async () => {
    try {
      if (!navigator.clipboard) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="invite">
      <span className="invite-label">邀请码</span>
      <code className="invite-code">{code}</code>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
        {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}
      </button>
      <span className="sr-only" role="status">
        {copyState === "copied" ? "邀请码已复制" : ""}
      </span>
    </div>
  );
}
