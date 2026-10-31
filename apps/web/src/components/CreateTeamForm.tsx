import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTeam, type TeamSummary } from "@teamsync/shared";
import { useState, type FormEvent } from "react";

import { ErrorBanner } from "../components/ErrorBanner";
import { FormField, TextareaField } from "../components/FormField";
import { teamsQueryKey } from "../hooks/useSession";
import { fieldErrorMap, friendlyMessage } from "../lib/errors";
import { countChars } from "../lib/text";

interface CreateTeamFormProps {
  onCancel: () => void;
  onCreated: (team: TeamSummary) => void;
}

export function CreateTeamForm({ onCancel, onCreated }: CreateTeamFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createTeam,
    onSuccess: async (team) => {
      await queryClient.invalidateQueries({ queryKey: teamsQueryKey });
      onCreated(team);
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
    const next: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      next.name = "请输入团队名称";
    } else if (countChars(trimmedName) > 50) {
      next.name = "团队名称不能超过 50 字";
    }
    if (countChars(trimmedDescription) > 2000) {
      next.description = "团队描述不能超过 2000 字";
    }

    setLocalErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    mutation.mutate({
      name: trimmedName,
      description: trimmedDescription || null,
    });
  };

  return (
    <form className="panel team-form" aria-label="创建团队表单" onSubmit={submit} noValidate>
      <div className="panel-head">
        <h2>创建团队</h2>
        <p className="muted">创建后你是 Owner，把邀请码发给同学即可加入。</p>
      </div>

      <ErrorBanner message={banner} />

      <FormField
        label="团队名称"
        name="name"
        value={name}
        error={errors.name}
        hint="1–50 字"
        onChange={(event) => {
          setName(event.target.value);
          mutation.reset();
        }}
      />

      <TextareaField
        label="团队描述"
        name="description"
        rows={3}
        value={description}
        error={errors.description}
        hint="可选，最多 2000 字"
        onChange={(event) => {
          setDescription(event.target.value);
          mutation.reset();
        }}
      />

      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? "创建中…" : "创建团队"}
        </button>
      </div>
    </form>
  );
}
