import { useQuery } from "@tanstack/react-query";
import { getDependencyGraph } from "@teamsync/shared";
import { Link } from "react-router-dom";
import { friendlyMessage } from "../lib/errors";

export default function TaskDependencyGraph({teamId}:{teamId:number}) {
  const query = useQuery({queryKey:["task-graph",teamId], queryFn:() => getDependencyGraph(teamId)});
  if(query.isPending) return <p>依赖图加载中…</p>;
  if(query.isError) return <p role="alert">{friendlyMessage(query.error)}<button onClick={() => void query.refetch()}>重试</button></p>;
  const {nodes, edges} = query.data;
  if(!nodes.length) return <p>创建任务后可查看依赖关系。</p>;
  const depth = new Map<number,number>();
  for(let i=0;i<nodes.length;i++) {
    let changed = false;
    for(const n of nodes) {
      const incoming = edges.filter(e => e.to === n.id).map(e => e.from);
      if(!depth.has(n.id) && incoming.every(id => depth.has(id))) {
        depth.set(n.id,incoming.length ? Math.max(...incoming.map(id => depth.get(id)!))+1 : 0); changed = true;
      }
    }
    if(!changed) break;
  }
  const positions = new Map<number,{x:number;y:number}>(); const rows = new Map<number,number>();
  for(const n of nodes) {
    const level = depth.get(n.id) ?? 0; const row = rows.get(level) ?? 0;
    positions.set(n.id,{x:level*250+20,y:row*100+20}); rows.set(level,row+1);
  }
  const width = Math.max(500,(Math.max(...depth.values(),0)+1)*250);
  const height = Math.max(140,Math.max(...rows.values())*100+30);
  return <section className="dependency-panel"><h3>任务依赖图</h3><p className="muted">箭头从前置任务指向后续任务；前置全部完成后解除阻塞。</p><div className="dependency-scroll"><svg role="img" aria-label="任务前置依赖关系图" width={width} height={height}>
    <defs><marker id="dependency-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#64748b" /></marker></defs>
    {edges.map(e => {const a=positions.get(e.from)!,b=positions.get(e.to)!; return <path key={`${e.from}-${e.to}`} d={`M${a.x+200},${a.y+30} C${a.x+225},${a.y+30} ${b.x-25},${b.y+30} ${b.x},${b.y+30}`} stroke="#64748b" fill="none" markerEnd="url(#dependency-arrow)" />;})}
    {nodes.map(n => {const p=positions.get(n.id)!; return <g key={n.id}><rect x={p.x} y={p.y} width={200} height={65} rx={10} fill={n.status==="done" ? "#dcfce7" : n.blocked ? "#fff1e6" : "#eef2ff"} stroke="#94a3b8"/><text x={p.x+12} y={p.y+25}>{n.title.length>12 ? n.title.slice(0,12)+"…" : n.title}<title>{n.title}</title></text><text x={p.x+12} y={p.y+48} fontSize={12}>{n.blocked ? "前置未完成 · 阻塞" : ({todo:"待办",doing:"进行中",done:"完成"})[n.status]}</text></g>;})}
  </svg></div><ul>{edges.map(e => <li key={`${e.from}-${e.to}`}><Link to={`/app/teams/${teamId}/tasks?task=${e.from}`}>{nodes.find(n=>n.id===e.from)?.title}</Link> → <Link to={`/app/teams/${teamId}/tasks?task=${e.to}`}>{nodes.find(n=>n.id===e.to)?.title}</Link></li>)}</ul></section>;
}
