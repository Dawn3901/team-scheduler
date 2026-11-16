import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, chatWithAssistant, createEvent, listMembers, localInput, type AssistantMessage, type EventInput, type TeamSummary } from "@teamsync/shared";
import { Link } from "react-router-dom";
import { useTeams } from "../hooks/useSession";
import { friendlyMessage } from "../lib/errors";
import "./AiAssistant.css";

const POSITION_KEY = "teamsync.ai.position";
const GAP = 8;
/** 侧栏占用的横向空间：桌面为固定宽侧栏，窄屏为抽屉（不占横向空间）。 */
function railWidth() {
  if (!window.matchMedia?.("(max-width: 980px)").matches) {
    const rail = document.querySelector<HTMLElement>(".app-sidebar");
    if (rail) return Math.round(rail.getBoundingClientRect().width);
  }
  return 0;
}
function initialPosition() {
  try {
    const p = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return p as { x: number; y: number };
  } catch { /* 损坏的本地偏好使用默认位置。 */ }
  return { x: window.innerWidth - 400, y: window.innerHeight - 590 };
}
function Chat({ team }: { team: TeamSummary }) {
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: ["ai-members", team.id], queryFn: () => listMembers(team.id) });
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<EventInput | null>(null);
  const [conflict, setConflict] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { log.current?.scrollTo?.(0, log.current.scrollHeight); }, [messages, busy]);
  async function send(text: string) {
    if (lock.current || !text.trim()) return;
    lock.current = true; setBusy(true); setError(""); setDraft(null); setCreatedId(null); setConflict(false);
    const next: AssistantMessage[] = [...messages.slice(-18), { role: "user", content: text.trim() }];
    setMessages(next); setInput("");
    try {
      const reply = await chatWithAssistant(team.id, next);
      if (alive.current) {
        setMessages([...next, { role: "assistant", content: reply.answer }]); setDraft(reply.draft);
      }
    } catch (err) { if (alive.current) { setMessages(messages); setError(friendlyMessage(err)); setInput(text); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function save(force = false) {
    if (!draft || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const event = await createEvent(team.id, { ...draft, ignore_conflicts: force });
      if (alive.current) { setCreatedId(event.id); setDraft(null); setConflict(false); }
      await queryClient.invalidateQueries();
    } catch (err) {
      if (alive.current) {
        setConflict(err instanceof ApiError && err.code === "TIME_CONFLICT");
        setError(friendlyMessage(err));
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <>
    <div className="ai-context"><span className="ai-context-dot" /><span>{team.name}</span><span className="ai-context-label">团队空间</span></div>
    <details className="ai-disclosure"><summary>数据使用说明 · AI 回复请核对</summary><p>发送后，将把本团队可见待办、未来31天日程及对话发给 AI 服务。回复可能有误，请核对。</p></details>
    <div className="ai-messages" role="log" aria-label="AI 对话记录" ref={log}>
      {!messages.length && <div className="ai-welcome">
        <span className="ai-welcome-symbol" aria-hidden="true">✦</span>
        <span className="ai-eyebrow">让协作，轻松一点</span>
        <h2>今天，有什么安排？</h2>
        <p>把琐碎的日程交给我。<br />帮你梳理待办，也帮你安排下一次相聚。</p>
        <div className="ai-suggestions">
          <button type="button" onClick={() => { setInput("我的待办有哪些？"); document.getElementById("ai-message")?.focus(); }}><span aria-hidden="true">☷</span><span><strong>梳理我的待办</strong><small>看看还有哪些事情需要处理</small></span><span aria-hidden="true">↗</span></button>
          <button type="button" onClick={() => { setInput("帮我安排明天下午三点到四点的项目讨论会"); document.getElementById("ai-message")?.focus(); }}><span aria-hidden="true">＋</span><span><strong>安排一场活动</strong><small>说出时间，帮你准备活动草稿</small></span><span aria-hidden="true">↗</span></button>
        </div>
      </div>}
      {messages.map((m, i) => <div key={i} className={`ai-message ai-${m.role}`}><strong>{m.role === "user" ? "我" : "✦ 同频助手"}</strong><div>{m.content}</div></div>)}
      {busy && <div className="ai-thinking" role="status"><span /><span /><span /><small>正在为你整理…</small></div>}
    </div>
    {draft && <section className="ai-draft" aria-label="活动草稿">
      <div className="ai-draft-label"><span aria-hidden="true">▦</span> 活动草稿<span>待你确认</span></div>
      <strong>{draft.title}</strong>
      <p>{localInput(draft.start_at, team.timezone).replace("T", " ")} → {localInput(draft.end_at, team.timezone).replace("T", " ")}（{team.timezone}）</p>
      <p>{draft.all_day ? "全天 · " : ""}{draft.location || "未设置地点"} · {draft.visibility === "private" ? "私密" : "团队可见"}</p>
      {draft.description && <p>{draft.description}</p>}
      <p>邀请成员：{draft.participant_ids.map(id => members.data?.items.find(m => m.user_id === id)?.display_name ?? `成员 #${id}`).join("、") || "无（仅自己）"}</p>
      <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>确认创建活动</button>
      {conflict && <button className="btn btn-danger" disabled={busy} onClick={() => void save(true)}>忽略冲突并创建</button>}
      <button className="btn btn-ghost" disabled={busy} onClick={() => { setDraft(null); setConflict(false); setError(""); }}>放弃草稿</button>
    </section>}
    {createdId && <p className="ai-success" role="status">已创建活动。<Link to={`/app/teams/${team.id}/events/${createdId}`}>查看活动</Link></p>}
    {error && <p role="alert" className="ai-error">{error}</p>}
    <form className="ai-input" onSubmit={e => { e.preventDefault(); void send(input); }}>
      <label className="sr-only" htmlFor="ai-message">给 AI 助手发送消息</label>
      <textarea id="ai-message" placeholder="询问待办，或描述要创建的活动…" value={input} maxLength={4000} onChange={e => setInput(e.target.value)} disabled={busy} />
      <button className="ai-send" aria-label="发送" title="发送消息" disabled={busy || !input.trim()}><span aria-hidden="true">↑</span></button>
    </form>
    <div className="ai-footer">同频 AI · 活动由你确认后创建</div>
  </>;
}
export default function AiAssistant({ currentTeamId, onHide }: { currentTeamId: number; onHide: () => void }) {
  const teams = useTeams();
  const [chosen, setChosen] = useState(0);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const box = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const selected = teams.data?.items.find(t => t.id === (currentTeamId || chosen)) ?? teams.data?.items[0];
  const width = open ? Math.min(410, window.innerWidth - 16) : 126;
  const height = open ? Math.min(640, window.innerHeight - 24) : 52;
  // 夹紧到侧栏右侧的工作区，避免助手压住导航或滚出视口。
  const clamp = (x: number, y: number) => {
    const minX = railWidth() + GAP;
    const maxX = Math.max(minX, window.innerWidth - width - GAP);
    return { x: Math.max(minX, Math.min(x, maxX)), y: Math.max(GAP, Math.min(y, window.innerHeight - height - GAP)) };
  };
  const shown = clamp(position.x, position.y);
  useEffect(() => {
    const resize = () => setPosition(p => ({ ...p }));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  function down(e: PointerEvent<HTMLElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".ai-heading button")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: shown.x, py: shown.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setPosition(clamp(d.px + dx, d.py + dy));
  }
  function up() {
    if (!drag.current) return;
    if (!open && !drag.current.moved) setOpen(true);
    else localStorage.setItem(POSITION_KEY, JSON.stringify(shown));
    drag.current = null;
  }
  return <aside ref={box} className={`ai-widget ${open ? "ai-expanded" : ""}`} aria-label="AI 助手" style={{ left: shown.x, top: shown.y, width, ...(open ? { height } : {}) }}>
    {open ? <>
      <header className="ai-heading" title="拖动标题栏移动助手" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}>
        <span className="ai-brand-symbol" aria-hidden="true">✦</span><strong>同频助手 <span className="ai-beta">AI</span><small>你的团队协作搭档</small></strong>
        <button aria-label="收起 AI 助手" onClick={() => setOpen(false)}>−</button>
        <button aria-label="隐藏 AI 助手" onClick={onHide}>×</button>
      </header>
      {!currentTeamId && <label className="ai-team">选择团队<select aria-label="AI 助手团队" value={selected?.id || ""} onChange={e => setChosen(Number(e.target.value))}>{teams.data?.items.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      {selected ? <Chat key={selected.id} team={selected} /> : <p>请先创建或加入团队。{teams.isError ? "团队加载失败，请刷新重试。" : ""}</p>}
    </> : <button className="ai-launcher" aria-label="✦ AI 助手" title="点击打开，拖动移动" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onClick={e => { if (e.detail === 0) setOpen(true); }}><span className="ai-launcher-symbol" aria-hidden="true">✦</span><span>AI 助手</span></button>}
  </aside>;
}
