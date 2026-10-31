import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken, register } from "@teamsync/shared";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { ErrorBanner } from "../components/ErrorBanner";
import { FormField } from "../components/FormField";
import { meQueryKey } from "../hooks/useSession";
import { fieldErrorMap, friendlyMessage } from "../lib/errors";

const PASSWORD_MAX_BYTES = 72;

function passwordBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (auth) => {
      queryClient.setQueryData(meQueryKey, auth.user);
      navigate("/app", { replace: true });
    },
  });

  if (getToken()) {
    return <Navigate to="/app" replace />;
  }

  const serverErrors = fieldErrorMap(mutation.error);
  const errors = { ...serverErrors, ...localErrors };
  const banner =
    mutation.isError && Object.keys(serverErrors).length === 0
      ? friendlyMessage(mutation.error)
      : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUsername) {
      next.username = "请输入用户名";
    } else if (Array.from(trimmedUsername).length > 50) {
      next.username = "用户名不能超过 50 字";
    }
    if (!trimmedDisplayName) {
      next.display_name = "请输入显示名";
    } else if (Array.from(trimmedDisplayName).length > 50) {
      next.display_name = "显示名不能超过 50 字";
    }
    if (Array.from(password).length < 8) {
      next.password = "密码至少 8 位";
    } else if (passwordBytes(password) > PASSWORD_MAX_BYTES) {
      next.password = `密码不能超过 ${PASSWORD_MAX_BYTES} 字节`;
    }
    if (trimmedEmail.length > 255) {
      next.email = "邮箱不能超过 255 字";
    }

    setLocalErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }

    mutation.mutate({
      username: trimmedUsername,
      display_name: trimmedDisplayName,
      password,
      email: trimmedEmail || null,
    });
  };

  return (
    <AuthLayout
      title="创建账号"
      subtitle="注册后即可创建团队，或凭邀请码加入。"
      footer={
        <>
          已有账号？<Link to="/login">直接登录</Link>
        </>
      }
    >
      <form className="form" onSubmit={submit} noValidate>
        <ErrorBanner message={banner} />

        <FormField
          label="用户名"
          name="username"
          autoComplete="username"
          value={username}
          error={errors.username}
          hint="登录用，1–50 字"
          onChange={(event) => {
            setUsername(event.target.value);
            mutation.reset();
          }}
        />

        <FormField
          label="显示名"
          name="display_name"
          autoComplete="nickname"
          value={displayName}
          error={errors.display_name}
          hint="成员列表里展示的名字"
          onChange={(event) => {
            setDisplayName(event.target.value);
            mutation.reset();
          }}
        />

        <FormField
          label="密码"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint="至少 8 位"
          onChange={(event) => {
            setPassword(event.target.value);
            mutation.reset();
          }}
        />

        <FormField
          label="邮箱"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          error={errors.email}
          hint="可选"
          onChange={(event) => {
            setEmail(event.target.value);
            mutation.reset();
          }}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={mutation.isPending}>
          {mutation.isPending ? "注册中…" : "注册并登录"}
        </button>
      </form>
    </AuthLayout>
  );
}
