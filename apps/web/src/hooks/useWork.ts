import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { friendlyMessage } from "../lib/errors";

export function useAction() {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => {
      setError("");
      if (!navigator.onLine) throw new Error("当前离线，请联网后重试");
      return action();
    },
    onSuccess: () => client.invalidateQueries(),
    onError: (e) => setError(e instanceof Error && e.message.includes("离线") ? e.message : friendlyMessage(e)),
  });
  return { run: mutation.mutateAsync, pending: mutation.isPending, error, setError };
}
