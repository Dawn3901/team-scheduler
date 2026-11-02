"""RT-1..6：每用户多连接；消息仅传 ID；单进程 asyncio 队列。"""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Notification, TeamMember, User, now_utc
from app.scheduler.backup import backup_sqlite
from app.scheduler.reminders import scan_reminders
from app.security import decode_access_token
from app.services.work import timestamp

router = APIRouter()
connections: dict[int, set[asyncio.Queue]] = {}


def emit(user_id: int, kind: str, payload: dict) -> None:
    for queue in connections.get(user_id, set()):
        if not queue.full():
            queue.put_nowait({"type": kind, "payload": payload, "ts": timestamp(now_utc())})


def refresh_team(team_id: int) -> None:
    with SessionLocal() as db:
        ids = db.scalars(
            select(TeamMember.user_id).where(
                TeamMember.team_id == team_id, TeamMember.status == "active"
            )
        )
        for uid in ids:
            emit(uid, "calendar.changed", {"team_id": team_id})


def refresh_notifications() -> None:
    with SessionLocal() as db:
        for uid in list(connections):
            newest = db.scalar(
                select(Notification.id)
                .where(Notification.user_id == uid)
                .order_by(Notification.id.desc())
                .limit(1)
            )
            if newest:
                emit(uid, "notification.created", {"notification_id": newest})


async def ticker() -> None:
    while True:
        await asyncio.sleep(60)

        # DB 操作移出事件循环，广播留在当前 loop。
        def scan():
            with SessionLocal() as db:
                scan_reminders(db)

        try:
            await asyncio.to_thread(scan)
            await asyncio.to_thread(backup_sqlite, get_settings().database_url)
            refresh_notifications()
        except Exception:
            logging.getLogger(__name__).exception("reminder_scan_failed")


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(ticker())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = "") -> None:
    try:
        payload = decode_access_token(token)
        uid = int(payload["sub"])
        with SessionLocal() as db:
            if db.get(User, uid) is None:
                raise ValueError
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    connections.setdefault(uid, set()).add(queue)
    emit(uid, "connected", {"user_id": uid})

    async def sender():
        while True:
            await websocket.send_json(await queue.get())

    sender_task = asyncio.create_task(sender())
    try:
        while True:
            data = await websocket.receive_json()
            # 每次心跳重新验证 token，过期或已删除用户不能无限持有连接。
            try:
                decode_access_token(token)
            except jwt.InvalidTokenError:
                await websocket.close(code=4401)
                break
            if data.get("type") == "ping":
                await websocket.send_json(
                    {"type": "pong", "payload": {}, "ts": timestamp(now_utc())}
                )
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        connections[uid].discard(queue)
        if not connections[uid]:
            del connections[uid]
        sender_task.cancel()
        with suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
            await sender_task


def publish_resource(kind: str, resource_id: int, method: str, suffix: str = "") -> None:
    """提交后发布最小事件；私密活动 ID 只发给可见的活跃成员。"""
    from app.models import Event, Task
    from app.services.work import can_view, participants

    with SessionLocal() as db:
        item = db.get(Event if kind == "events" else Task, resource_id)
        if item is None:
            return
        ids = list(
            db.scalars(
                select(TeamMember.user_id).where(
                    TeamMember.team_id == item.team_id, TeamMember.status == "active"
                )
            )
        )
        if kind == "tasks":
            for uid in ids:
                emit(uid, "task.updated", {"team_id": item.team_id, "task_id": item.id})
        else:
            event_kind = "event.cancelled" if item.status == "cancelled" else "event.updated"
            for uid in ids:
                if can_view(db, item, uid):
                    if suffix == "rsvp":
                        # RSVP 的操作人由已变更的 responded_at 最大值确定。
                        people = [p for p in participants(db, item.id) if p.responded_at]
                        if people:
                            p = max(people, key=lambda p: p.responded_at)
                            emit(
                                uid,
                                "rsvp.updated",
                                {
                                    "team_id": item.team_id,
                                    "event_id": item.id,
                                    "user_id": p.user_id,
                                    "response": p.response,
                                },
                            )
                    else:
                        emit(uid, event_kind, {"team_id": item.team_id, "event_id": item.id})
