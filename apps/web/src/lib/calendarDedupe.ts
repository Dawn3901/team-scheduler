import type { MyTeamEvent, PersonalEvent } from "@teamsync/shared";

/** 统一成 `YYYY-MM-DDTHH:MM:SSZ`（去毫秒、去时区后缀差异），避免字符串比较漏判重叠。 */
export function normalizeIso(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(" ", "T")
    .replace(/\.\d+/, "")
    .replace(/([+-]\d{2}:?\d{2})$/, "Z");
}

/** 个人事件是否已在团队活动投影中出现（同一标题 + 同一时间段），避免重复与统计错误。 */
export function isAlsoInTeam(
  item: Pick<PersonalEvent, "title" | "start_at" | "end_at">,
  team: MyTeamEvent[],
): boolean {
  const start = normalizeIso(item.start_at);
  const end = normalizeIso(item.end_at);
  return team.some(
    event =>
      event.title === item.title &&
      normalizeIso(event.start_key ?? event.start_at) === start &&
      normalizeIso(event.end_key ?? event.end_at) === end,
  );
}
