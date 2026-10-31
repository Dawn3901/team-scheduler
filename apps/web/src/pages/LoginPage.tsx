import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken, login } from "@teamsync/shared";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { ErrorBanner } from "../components/ErrorBanner";
import { FormField } from "../components/FormField";
import { meQueryKey } from "../hooks/useSession";
import { fieldErrorMap, friendlyMessage } from "../lib/errors";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (auth) => {
      queryClient.setQueryData(meQueryKey, auth.user);
      const from = (location.state as { from?: string } | null)?.from;
      const target = from?.startsWith("/app") ? from : "/app";
      navigate(target, { replace: true });
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
    if (!username.trim()) {
      next.username = "请输入用户名";
    }
    if (!password) {
      next.password = "请输入密码";
    }
    setLocalErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }
    mutation.mutate({ username: username.trim(), password });
  };

  return (
    <AuthLayout
      title="登录同频"
      subtitle="和团队共享日程，少一次来回确认。"
      footer={
        <>
          还没有账号？<Link to="/register">注册一个</Link>
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
          onChange={(event) => {
            setUsername(event.target.value);
            mutation.reset();
          }}
        />

        <FormField
          label="密码"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            mutation.reset();
          }}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={mutation.isPending}>
          {mutation.isPending ? "登录中…" : "登录"}
        </button>
      </form>
    </AuthLayout>
  );
}
