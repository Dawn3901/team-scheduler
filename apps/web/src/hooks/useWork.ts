import { useMutation, useQueryClient } from "@tanstack/react-query";

import { friendlyMessage } from "../lib/errors";
import { useToast } from "../lib/toast";

export function useAction() {
  const client = useQueryClient();
  const { notify } = useToast();
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => {
      if (!navigator.onLine) throw new Error("当前离线，请联网后重试");
      return action();
    },
    onSuccess: () => client.invalidateQueries(),
    onError: (error) => {
      const message =
        error instanceof Error && error.message.includes("离线")
          ? error.message
          : friendlyMessage(error);
      notify(message, { tone: "error" });
    },
  });
  return { run: mutation.mutateAsync, pending: mutation.isPending };
}
