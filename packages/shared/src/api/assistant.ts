import type { EventInput } from "./work";
import { request } from "./client";

export interface AssistantMessage { role: "user" | "assistant"; content: string; }
export interface AssistantReply { answer: string; draft: EventInput | null; }
export function chatWithAssistant(teamId: number, messages: AssistantMessage[]) {
  return request<AssistantReply>(`/teams/${teamId}/assistant/chat`, {
    method: "POST", body: JSON.stringify({ messages }),
  }, { timeoutMs: 60_000 });
}
