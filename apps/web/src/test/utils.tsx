import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TeamSummary, UserSummary } from "@teamsync/shared";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import App from "../App";

export const USER: UserSummary = {
  id: 1,
  username: "lin",
  display_name: "林",
  avatar_color: "#4F46E5",
};

export const TEAM: TeamSummary = {
  id: 1,
  name: "软工大作业",
  description: "6 周项目",
  invite_code: "AB12CD34",
  owner_id: 1,
  timezone: "Asia/Shanghai",
  my_role: "owner",
  member_count: 1,
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ code, message, details: {} }, status);
}

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

export function mockFetch(handler: FetchHandler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderApp(initialEntries: string[] = ["/app"]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { queryClient, ...view };
}

export function authPayload(token = "token-1") {
  return { access_token: token, token_type: "bearer", user: USER };
}
