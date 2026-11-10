"""TASK-11：同团队有向无环图和状态约束，所有检查在提交前执行。"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Task, TaskDependency


def parents(db: Session, task_id: int) -> list[Task]:
    return list(
        db.scalars(
            select(Task)
            .join(TaskDependency, TaskDependency.depends_on_id == Task.id)
            .where(TaskDependency.task_id == task_id, Task.deleted_at.is_(None))
            .order_by(Task.id)
        )
    )


def summary(db: Session, task: Task) -> dict:
    dependencies = parents(db, task.id)
    blocked = [t.id for t in dependencies if t.status != "done"]
    return {
        "dependency_ids": [t.id for t in dependencies],
        "blocked_by": blocked,
        "blocked": bool(blocked),
        "dependency_warnings": [
            f"前置任务「{t.title}」的截止时间晚于本任务"
            for t in dependencies
            if t.due_at.replace(tzinfo=None) > task.due_at.replace(tzinfo=None)
        ],
    }


def set_dependencies(db: Session, task: Task, ids: list[int] | None) -> None:
    if ids is None:
        raise ApiError(422, "INVALID_DEPENDENCY", "依赖列表不能为 null")
    wanted = set(ids)
    if task.id in wanted:
        raise ApiError(422, "DEPENDENCY_CYCLE", "任务不能依赖自身")
    rows = list(
        db.scalars(
            select(Task).where(
                Task.id.in_(wanted), Task.team_id == task.team_id, Task.deleted_at.is_(None)
            )
        )
    )
    if len(rows) != len(wanted):
        raise ApiError(422, "INVALID_DEPENDENCY", "前置任务必须是本团队的有效任务")
    tasks = list(
        db.scalars(select(Task.id).where(Task.team_id == task.team_id, Task.deleted_at.is_(None)))
    )
    edges = db.execute(
        select(TaskDependency.task_id, TaskDependency.depends_on_id).where(
            TaskDependency.task_id.in_(tasks)
        )
    ).all()
    graph = {tid: set() for tid in tasks}
    for child, parent in edges:
        graph[child].add(parent)
    graph[task.id] = wanted
    # 只改当前节点出边；新环必经过当前节点。显式栈避免长链触发Python递归上限。
    seen = set()
    stack = list(wanted)
    while stack:
        current = stack.pop()
        if current == task.id:
            raise ApiError(422, "DEPENDENCY_CYCLE", "依赖关系形成循环，请调整前置任务")
        if current not in seen:
            seen.add(current)
            stack.extend(graph.get(current, set()))
    if task.status in ("doing", "done") and any(t.status != "done" for t in rows):
        raise ApiError(409, "TASK_BLOCKED", "进行中或完成的任务不能添加未完成的前置任务")
    db.execute(delete(TaskDependency).where(TaskDependency.task_id == task.id))
    db.add_all([TaskDependency(task_id=task.id, depends_on_id=pid) for pid in sorted(wanted)])
    db.flush()


def check_status(db: Session, task: Task, status: str) -> None:
    if status in ("doing", "done") and summary(db, task)["blocked"]:
        raise ApiError(
            409,
            "TASK_BLOCKED",
            "请先完成全部前置任务",
            {"blocked_by": summary(db, task)["blocked_by"]},
        )
    if task.status == "done" and status != "done":
        downstream = db.scalar(
            select(Task.id)
            .join(TaskDependency, TaskDependency.task_id == Task.id)
            .where(
                TaskDependency.depends_on_id == task.id,
                Task.deleted_at.is_(None),
                Task.status.in_(["doing", "done"]),
            )
            .limit(1)
        )
        if downstream:
            raise ApiError(409, "DEPENDENCY_IN_USE", "请先重开下游任务，再重开此前置任务")


def check_delete(db: Session, task: Task) -> None:
    if db.scalar(
        select(Task.id)
        .join(TaskDependency, TaskDependency.task_id == Task.id)
        .where(TaskDependency.depends_on_id == task.id, Task.deleted_at.is_(None))
        .limit(1)
    ):
        raise ApiError(409, "DEPENDENCY_IN_USE", "仍有任务依赖此任务，请先解除依赖")


def graph_out(db: Session, team_id: int) -> dict:
    tasks = list(
        db.scalars(
            select(Task).where(Task.team_id == team_id, Task.deleted_at.is_(None)).order_by(Task.id)
        )
    )
    ids = [t.id for t in tasks]
    edges = db.execute(
        select(TaskDependency).where(
            TaskDependency.task_id.in_(ids), TaskDependency.depends_on_id.in_(ids)
        )
    ).scalars()
    return {
        "nodes": [
            {"id": t.id, "title": t.title, "status": t.status, **summary(db, t)} for t in tasks
        ],
        "edges": [{"from": e.depends_on_id, "to": e.task_id} for e in edges],
    }
