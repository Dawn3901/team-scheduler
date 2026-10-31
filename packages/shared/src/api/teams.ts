import type { Paginated, TeamSummary } from "../types";
import { request } from "./client";

/** 团队规模上限 50 人（BR-12），一次取满即可；后续需要再加重试分页。 */
const TEAM_PAGE_LIMIT = 100;

export interface CreateTeamPayload {
  name: string;
  description?: string | null;
}

export interface JoinTeamPayload {
  invite_code: string;
}

export function listTeams(): Promise<Paginated<TeamSummary>> {
  return request<Paginated<TeamSummary>>(`/teams?limit=${TEAM_PAGE_LIMIT}`);
}

export function createTeam(payload: CreateTeamPayload): Promise<TeamSummary> {
  return request<TeamSummary>("/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function joinTeam(payload: JoinTeamPayload): Promise<TeamSummary> {
  return request<TeamSummary>("/teams/join", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getTeam(teamId: number): Promise<TeamSummary> {
  return request<TeamSummary>(`/teams/${teamId}`);
}
