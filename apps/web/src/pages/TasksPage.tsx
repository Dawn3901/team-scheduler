import TaskDependencyGraph from "../components/TaskDependencyGraph";
import { useNow } from "../hooks/useNow";
import { useQuery } from "@tanstack/react-query";
import { completeTask, createTask, deleteTask, formatTime, listMembers, listTasks, localInput, reopenTask, toUtc, updateTask, type Task } from "@teamsync/shared";
import { useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { BackToCalendar } from "../components/BackToCalendar";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useMe, useTeam } from "../hooks/useSession";
import { useAction } from "../hooks/useWork";
import { friendlyMessage } from "../lib/errors";

export default function TasksPage() {
  const now = useNow();
  const id = Number(useParams().teamId); const team = useTeam(id).data; const me = useMe().data;
  const zone = team?.timezone || "Asia/Shanghai";
  const [status, setStatus] = useState(""); const [assignee, setAssignee] = useState("");
  const [showGraph,setShowGraph] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [params] = useSearchParams();
  const location = useLocation();
  const fromCalendar = Boolean((location.state as { fromCalendar?: string } | null)?.fromCalendar);
  const tasks = useQuery({queryKey: ["tasks", id, status, assignee], queryFn: () => listTasks(id, {...(status ? {status} : {}), ...(assignee ? {assignee_id: assignee} : {})})});
  const allTasks = useQuery({queryKey:["tasks",id],queryFn:() => listTasks(id)});
  const members = useQuery({queryKey: ["members", id], queryFn: () => listMembers(id)});
  const action = useAction();
  useEscapeKey(Boolean(editing) && !action.pending, () => setEditing(null));
  const edit = editing && editing !== "new" ? editing : null;
  const isAdmin = team?.my_role === "owner" || team?.my_role === "admin";
  return <section className="panel tasks-panel">
    {fromCalendar ? <BackToCalendar teamId={id} /> : null}
    <div className="page-head compact">
      <div>
        <p className="eyebrow">团队空间</p>
        <h2>任务看板</h2>
        <p className="muted">{tasks.data?.total ?? 0} 项任务 · 截止日会显示在日历</p>
      </div>
      <div className="panel-actions"><button className="btn btn-secondary" onClick={() => setShowGraph(!showGraph)}>依赖关系图</button><button className="btn btn-primary" onClick={() => setEditing("new")}>新建任务</button></div>
    </div>
    {showGraph && <TaskDependencyGraph teamId={id} />}
    <div className="work-toolbar">
      <label>任务状态<select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select></label>
      <label>负责人筛选<select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">全部负责人</option><option value={me?.id}>仅我</option>{members.data?.items.filter(m => m.user_id !== me?.id).map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
    </div>
    {tasks.isError && <p role="alert">{friendlyMessage(tasks.error)}</p>}
    {tasks.isPending && <p>任务加载中…</p>}
    {tasks.isError && <button onClick={() => void tasks.refetch()}>重试</button>}
    {tasks.data?.items.length === 0 && <p className="muted">暂无任务，创建一项团队任务吧。</p>}
    {tasks.data?.items.map(t => <article id={`task-${t.id}`} className={`work-row task-row ${t.overdue ? "overdue" : ""} ${t.status === "done" ? "done" : ""} ${params.get("task") === String(t.id) ? "highlight" : ""}`} key={t.id}>
      <div><strong>{t.title}</strong><p>{t.description}</p>{t.blocked && <p className="dependency-blocked">阻塞：请先完成 {t.blocked_by?.map(pid => allTasks.data?.items.find(x => x.id===pid)?.title || `#${pid}`).join("、")}</p>}{t.dependency_warnings?.map(w => <p className="dependency-warning" key={w}>{w}</p>)}<p className="muted">{t.assignee_name || "待重新指派"} · 截止 {formatTime(t.due_at, zone)} · {({low:"低",normal:"普通",high:"高"})[t.priority]}优先级</p>{t.overdue && <p className="danger-text">逾期 {Math.max(1, Math.ceil((now-Date.parse(t.due_at))/86400000))} 天</p>}</div>
      <div className="panel-actions">
        <span className={`task-status ${t.status}${t.overdue ? " overdue" : ""}`}>{({todo:"待办",doing:"进行中",done:"已完成"})[t.status]}</span>
        {(isAdmin || t.created_by === me?.id || t.assignee_id === me?.id) && <>
          {t.status === "todo" && <button className="btn btn-secondary" disabled={action.pending || t.blocked} onClick={() => void action.run(() => updateTask(t.id, {status:"doing"})).catch(() => {})}>开始任务</button>}
          <button className="btn btn-secondary" disabled={action.pending || (t.blocked && t.status !== "done")} onClick={() => void action.run(() => t.status === "done" ? reopenTask(t.id) : completeTask(t.id)).catch(() => {})}>{t.status === "done" ? "重新打开" : "完成任务"}</button>
        </>}
        {(isAdmin || t.created_by === me?.id) && <><button className="btn btn-ghost" onClick={() => setEditing(t)}>编辑</button><button className="btn btn-ghost" disabled={action.pending} onClick={() => {if(window.confirm(`确定删除任务「${t.title}」？`)) void action.run(() => deleteTask(t.id)).catch(() => {});}}>删除</button></>}
      </div>
    </article>)}
    {editing && <div className="modal-backdrop"><section className="work-dialog" role="dialog" aria-modal="true" aria-label={edit ? "编辑任务" : "新建任务"}><h3>{edit ? "编辑任务" : "新建任务"}</h3>
      <form className="work-form" onSubmit={e => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        void action.run(async () => {
          if(edit) {
            const latest = (await listTasks(id)).items.find(t => t.id === edit.id);
            if(latest && latest.updated_at !== edit.updated_at && !window.confirm("任务已被他人修改，确定覆盖？")) return;
          }
          const data = {title:String(f.get("title")), description:String(f.get("description")), assignee_id:Number(f.get("assignee")), due_at:toUtc(String(f.get("due")), zone), priority:String(f.get("priority")) as Task["priority"], dependency_ids:f.getAll("dependencies").map(Number)};
          if(edit) await updateTask(edit.id, data); else await createTask(id, data); setEditing(null);
        }).catch(() => {});
      }}>
        <label>任务标题<input name="title" maxLength={100} defaultValue={edit?.title} required autoFocus /></label>
        <label>任务描述<textarea name="description" maxLength={2000} defaultValue={edit?.description || ""} /></label>
        <label>任务负责人<select name="assignee" defaultValue={edit?.assignee_id || me?.id} required><option value="">请选择负责人</option>{members.data?.items.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></label>
        <label>截止时间<input name="due" type="datetime-local" defaultValue={localInput(edit?.due_at || new Date(now+86400000).toISOString(), zone)} required /></label>
        <label>任务优先级<select name="priority" defaultValue={edit?.priority || "normal"}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label>
        <fieldset><legend>前置任务（全部完成后才能开始本任务）</legend>{allTasks.data?.items.filter(t => t.id !== edit?.id).map(t => <label key={t.id}><input type="checkbox" name="dependencies" value={t.id} defaultChecked={edit?.dependency_ids?.includes(t.id)} />{t.title} · {t.status === "done" ? "已完成" : "未完成"}</label>)}{allTasks.data?.items.length === 0 && <p>暂无可选前置任务</p>}</fieldset>
        <div className="panel-actions"><button className="btn btn-primary" disabled={action.pending}>保存任务</button><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>取消</button></div>
      </form>
    </section></div>}
  </section>;
}
