import { getToken, setToken, UNAUTHORIZED_EVENT } from "./api/client";

/** 1–30 秒退避；WS 只使查询失效，HTTP 仍是唯一数据源。 */
export function connectRealtime(onRefresh: () => void, onState: (online: boolean) => void) {
  let socket: WebSocket | undefined;
  let stopped = false;
  let delay = 1000;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastPong = Date.now();
  const connect = () => {
    clearTimeout(retry);
    const token = getToken();
    if (stopped || !token || !navigator.onLine || socket) return;
    const url = new URL("/api/v1/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("token", token);
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      delay = 1000;
      lastPong = Date.now();
      onState(true);
      onRefresh();
      heartbeat = setInterval(() => {
        if (Date.now() - lastPong > 65000) { ws.close(); return; }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 30000);
    };
    ws.onmessage = e => {
      try {
        const message = JSON.parse(e.data);
        if (message.type === "pong") lastPong = Date.now();
        else onRefresh();
      } catch { ws.close(); }
    };
    ws.onclose = e => {
      clearInterval(heartbeat);
      if (socket === ws) socket = undefined;
      if (stopped) return;
      onState(false);
      if (e.code === 4401) {
        setToken(null);
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        return;
      }
      if (navigator.onLine) {
        retry = setTimeout(connect, delay);
        delay = Math.min(30000, delay * 2);
      }
    };
    ws.onerror = () => ws.close();
  };
  const offline = () => { clearTimeout(retry); onState(false); socket?.close(); };
  window.addEventListener("online", connect);
  window.addEventListener("offline", offline);
  connect();
  return () => {
    stopped = true;
    window.removeEventListener("online", connect);
    window.removeEventListener("offline", offline);
    clearTimeout(retry);
    clearInterval(heartbeat);
    socket?.close();
  };
}
