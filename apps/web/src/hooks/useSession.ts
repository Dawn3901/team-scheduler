import { useQuery } from "@tanstack/react-query";
import { fetchMe, getTeam, getToken, listTeams } from "@teamsync/shared";

export const meQueryKey = ["me"] as const;
export const teamsQueryKey = ["teams"] as const;
export const teamQueryKey = (teamId: number) => ["team", teamId] as const;

export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    enabled: Boolean(getToken()),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useTeams() {
  return useQuery({
    queryKey: teamsQueryKey,
    queryFn: listTeams,
    enabled: Boolean(getToken()),
  });
}

export function useTeam(teamId: number) {
  return useQuery({
    queryKey: teamQueryKey(teamId),
    queryFn: () => getTeam(teamId),
    enabled: Boolean(getToken()) && Number.isInteger(teamId) && teamId > 0,
    retry: false,
  });
}
