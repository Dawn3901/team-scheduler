import { useQuery } from "@tanstack/react-query";
import { listEvents, listTasks } from "@teamsync/shared";
import { useEffect } from "react";

import { buildAndroidSchedule, getAndroidBridge } from "../lib/androidNotifications";

import { useMe } from "./useSession";

let permissionAsked = false;

/**
 * Android 本地通知同步：
 * - 只在原生壳注入 TeamSyncAndroid 时工作，普通浏览器零开销；
 * - 每次进入/切换团队、或 WS 使查询失效后，重算未来 7 天并整批替换；
 * - 权限只主动询问一次，拒绝后 Web 其他功能不受影响。
 */
export function useNativeNotifications(teamId: number, enabled: boolean) {
  const me = useMe();
  const bridge = getAndroidBridge();
  const active = enabled && Boolean(bridge) && Boolean(me.data);

  const events = useQuery({
    queryKey: ["native-notify", "events", teamId],
    queryFn: () => {
      const now = Date.now();
      return listEvents(teamId, new Date(now).toISOString(), new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString());
    },
    enabled: active,
    staleTime: 30_000,
  });

  const tasks = useQuery({
    queryKey: ["native-notify", "tasks", teamId],
    queryFn: () => listTasks(teamId),
    enabled: active,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!active || !bridge || !me.data || !events.data || !tasks.data) {
      return;
    }
    const items = buildAndroidSchedule(events.data.items, tasks.data.items, {
      teamId,
      userId: me.data.id,
    });
    try {
      bridge.schedule(teamId, "events", JSON.stringify(items.filter((item) => item.kind === "event")));
      bridge.schedule(teamId, "tasks", JSON.stringify(items.filter((item) => item.kind === "task")));
    } catch {
      // 原生壳版本不匹配时不阻塞 Web；下一次进入团队会再尝试。
    }
  }, [active, bridge, events.data, me.data, tasks.data, teamId]);

  useEffect(() => {
    if (!active || !bridge || permissionAsked) {
      return;
    }
    permissionAsked = true;
    try {
      if (bridge.permission() !== "granted") {
        bridge.requestPermission();
      }
    } catch {
      // 忽略权限桥异常，保持 Web 可用。
    }
  }, [active, bridge]);
}
