import { useMutation, useQueryClient } from "@tanstack/react-query";
import { joinTeam, type TeamSummary } from "@teamsync/shared";
import { useState, type FormEvent } from "react";

import { ErrorBanner } from "../components/ErrorBanner";
import { FormField } from "../components/FormField";
import { teamsQueryKey } from "../hooks/useSession";
import { fieldErrorMap, friendlyMessage } from "../lib/errors";

interface JoinTeamFormProps {
  onCancel: () => void;
  onJoined: (team: TeamSummary) => void;
}

const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

export function JoinTeamForm({ onCancel, onJoined }: JoinTeamFormProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: joinTeam,
    onSuccess: async (team) => {
      await queryClient.invalidateQueries({ queryKey: teamsQueryKey });
      onJoined(team);
    },
  });

  const serverErrors = fieldErrorMap(mutation.error);
  const errors = { ...serverErrors, ...localErrors };
  const banner =
    mutation.isError && Object.keys(serverErrors).length === 0
      ? friendlyMessage(mutation.error)
      : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = inviteCode.trim();
    const next: Record<string, string> = {};

    if (!code) {
      next.invite_code = "请输入邀请码";
    } else if (!INVITE_CODE_PATTERN.test(code)) {
      next.invite_code = "邀请码是 8 位字母或数字";
    }

    setLocalErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    mutation.mutate({ invite_code: code });
  };

  return (
    <form className="panel team-form" aria-label="加入团队表单" onSubmit={submit} noValidate>
      <div className="panel-head">
        <h2>用邀请码加入</h2>
        <p className="muted">向团队 Owner 或管理员要 8 位邀请码。</p>
      </div>

      <ErrorBanner message={banner} />

      <FormField
        label="邀请码"
        name="invite_code"
        value={inviteCode}
        error={errors.invite_code}
        hint="例如 AB12CD34"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setInviteCode(event.target.value.toUpperCase());
          mutation.reset();
        }}
      />

      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "加入中…" : "加入团队"}
        </button>
      </div>
    </form>
  );
}
