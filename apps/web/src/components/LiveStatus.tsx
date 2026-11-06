import { useQuery, useQueryClient } from "@tanstack/react-query";
import { connectRealtime, listNotifications } from "@teamsync/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Icon } from "./Icon";

import { useToast } from "../lib/toast";

export default function LiveStatus() {
  const client = useQueryClient();
  const { notify } = useToast();
  const [online, setOnline] = useState(true);
  const query = useQuery({
    queryKey: ["notifications", "badge"],
    queryFn: () => listNotifications(),
    refetchInterval: 30000,
  });
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    return connectRealtime(
      () => {
        void client.invalidateQueries();
      },
      setOnline,
    );
  }, [client]);
  useEffect(() => {
    const notice = query.data?.items[0];
    if (notice && last.current !== null && notice.id > last.current && !notice.read_at) {
      notify(<Link to="/app/notifications">{notice.title}</Link>, { tone: "info" });
    }
    if (notice) last.current = notice.id;
  }, [query.data, notify]);
  const unread = query.data?.unread_count ?? 0;
  return (
    <>
      <Link
        to="/app/notifications"
        className="bell-link"
        aria-label={`通知 (${unread} 条未读)`}
      >
        <Icon name="bell" />
        {unread > 0 ? <span className="bell-badge">{unread}</span> : null}
      </Link>
      {!online && (
        <span role="status" className="danger-text">
          连接已断开，正在重连…
        </span>
      )}
    </>
  );
}
