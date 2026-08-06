from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from .bot_policy import advance_bot_players, public_game_state, require_human_action, run_bot_simulation
from .server_models import User
from .goldfishing_engine import perform_action


ROOM_STATE_IN_GAME = "IN_GAME"
ROOM_STATE_FINISHED = "FINISHED"
ROOM_STATE_QUEUED = "QUEUED"
ROOM_STATE_RUNNING = "RUNNING"
ROOM_STATE_FAILED = "FAILED"
ROOM_STATE_CANCELLED = "CANCELLED"
COMMAND_STREAM_KEY = "game:commands"
DEFAULT_GAME_TYPE = "chronicle_solo"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _room_key(room_id: str) -> str:
    return f"game:room:{room_id}"


def _result_key(room_id: str) -> str:
    return f"game:result:{room_id}"


def _history_key(user_id: str) -> str:
    return f"game:user:{user_id}:history"


def _simulation_history_key(user_id: str) -> str:
    return f"game:user:{user_id}:simulations"


def _public_room(room: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": room.get("id", ""),
        "owner_user_id": room.get("owner_user_id", ""),
        "mode": room.get("mode", "solo"),
        "game_type": room.get("game_type", DEFAULT_GAME_TYPE),
        "state": room.get("state", ROOM_STATE_IN_GAME),
        "created_at": room.get("created_at", ""),
        "started_at": room.get("started_at", ""),
        "ended_at": room.get("ended_at") or None,
        "result_id": room.get("result_id") or None,
        "level_id": room.get("level_id", ""),
        "player_count": int(room.get("player_count") or 0),
        "error": room.get("error") or None,
    }


class GameRoomService:
    def __init__(self, redis_client=None) -> None:
        self.redis = redis_client
        self._memory_rooms: dict[str, dict[str, Any]] = {}
        self._memory_results: dict[str, dict[str, Any]] = {}
        self._memory_history: dict[str, list[str]] = {}
        self._memory_simulations: dict[str, list[str]] = {}
        self._cancelled_simulations: set[str] = set()

    def configure_redis(self, redis_client) -> None:
        self.redis = redis_client

    def new_room_id(self) -> str:
        return f"chronicle_{uuid.uuid4().hex[:16]}"

    async def create_room(
        self,
        *,
        user: User,
        game_type: str,
        game_state: dict[str, Any] | None = None,
        room_id: str | None = None,
    ) -> dict[str, Any]:
        normalized_game_type = str(game_type or DEFAULT_GAME_TYPE).strip() or DEFAULT_GAME_TYPE
        if normalized_game_type != DEFAULT_GAME_TYPE:
            raise ValueError("Only Chronicle solo rooms are available right now.")
        room_id = room_id or self.new_room_id()
        now = _now_iso()
        bot_only = (game_state or {}).get("mode") == "bots_only"
        resolved_game_state = (game_state or {}) if bot_only else advance_bot_players(game_state or {})
        room = {
            "id": room_id,
            "owner_user_id": user.id,
            "owner_username": user.username or user.email or user.id,
            "mode": resolved_game_state.get("mode", "solo"),
            "game_type": normalized_game_type,
            "state": ROOM_STATE_QUEUED if bot_only else ROOM_STATE_IN_GAME,
            "created_at": now,
            "started_at": now,
            "ended_at": "",
            "result_id": "",
            "level_id": str(resolved_game_state.get("level_id") or ""),
            "player_count": len(resolved_game_state.get("players") or []),
            "error": "",
            "game_state": json.dumps(resolved_game_state),
        }
        if self.redis is None:
            self._memory_rooms[room_id] = room
            if bot_only:
                self._memory_simulations.setdefault(user.id, []).append(room_id)
                await self.run_bot_simulation_job(room_id=room_id, user_id=user.id)
                room = self._memory_rooms[room_id]
            return _public_room(room)
        await self.redis.hset(_room_key(room_id), mapping=room)
        if bot_only:
            await self.redis.zadd(_simulation_history_key(user.id), {room_id: time.time()})
            await self.redis.xadd(
                COMMAND_STREAM_KEY,
                {"action": "simulate_bot_room", "room_id": room_id, "user_id": user.id},
                maxlen=1000,
                approximate=True,
            )
        return _public_room(room)

    async def list_simulations(self, *, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        if self.redis is None:
            room_ids = list(reversed(self._memory_simulations.get(user_id, [])))[:limit]
        else:
            room_ids = await self.redis.zrevrange(_simulation_history_key(user_id), 0, max(0, limit - 1))
        rooms = [await self._load_room(str(room_id)) for room_id in room_ids]
        return [_public_room(room) for room in rooms if room]

    async def delete_simulation(self, *, room_id: str, user_id: str) -> None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user_id or room.get("mode") != "bots_only":
            raise LookupError("Bot simulation not found.")
        if room.get("state") in {ROOM_STATE_QUEUED, ROOM_STATE_RUNNING}:
            self._cancelled_simulations.add(room_id)
        if self.redis is None:
            self._memory_simulations[user_id] = [
                candidate for candidate in self._memory_simulations.get(user_id, []) if candidate != room_id
            ]
            self._memory_rooms.pop(room_id, None)
            self._cancelled_simulations.discard(room_id)
            return
        await self.redis.zrem(_simulation_history_key(user_id), room_id)
        if room.get("state") == ROOM_STATE_RUNNING:
            room["state"] = ROOM_STATE_CANCELLED
            room["ended_at"] = _now_iso()
            await self._store_room(room)
        else:
            await self.redis.delete(_room_key(room_id))

    async def run_bot_simulation_job(self, *, room_id: str, user_id: str) -> None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user_id or room.get("state") not in {
            ROOM_STATE_QUEUED,
            ROOM_STATE_RUNNING,
        }:
            self._cancelled_simulations.discard(room_id)
            return
        room["state"] = ROOM_STATE_RUNNING
        room["started_at"] = _now_iso()
        await self._store_room(room)
        try:
            state = await asyncio.to_thread(run_bot_simulation, _decode_state(room.get("game_state")))
            latest_room = await self._load_room(room_id)
            if room_id in self._cancelled_simulations or not latest_room or latest_room.get("state") == ROOM_STATE_CANCELLED:
                await self._remove_cancelled_room(room_id)
                return
            from .database import SessionLocal
            from .replay_service import save_bot_replay

            with SessionLocal() as db:
                replay = save_bot_replay(db, state=state, owner_user_id=user_id)
                latest_room = await self._load_room(room_id)
                if room_id in self._cancelled_simulations or not latest_room or latest_room.get("state") == ROOM_STATE_CANCELLED:
                    if replay is not None:
                        db.delete(replay)
                        db.commit()
                    await self._remove_cancelled_room(room_id)
                    return
            room["game_state"] = json.dumps(state)
            room["state"] = ROOM_STATE_FINISHED
            room["ended_at"] = _now_iso()
            room["result_id"] = replay.id if replay else ""
            room["error"] = ""
        except Exception as exc:
            if room_id in self._cancelled_simulations:
                await self._remove_cancelled_room(room_id)
                return
            room["state"] = ROOM_STATE_FAILED
            room["ended_at"] = _now_iso()
            room["error"] = str(exc)
        await self._store_room(room)

    async def _remove_cancelled_room(self, room_id: str) -> None:
        self._cancelled_simulations.discard(room_id)
        if self.redis is None:
            self._memory_rooms.pop(room_id, None)
        else:
            await self.redis.delete(_room_key(room_id))

    async def _store_room(self, room: dict[str, Any]) -> None:
        if self.redis is None:
            self._memory_rooms[str(room["id"])] = room
        else:
            await self.redis.hset(_room_key(str(room["id"])), mapping=room)

    async def get_game_state(self, *, room_id: str, user: User) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            return None
        return public_game_state(_decode_state(room.get("game_state")))

    async def get_internal_game_state(self, *, room_id: str, user_id: str) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user_id:
            return None
        return _decode_state(room.get("game_state"))

    async def apply_goldfishing_action(
        self,
        *,
        room_id: str,
        user: User,
        action: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            raise LookupError("Game room not found.")
        if room.get("mode") == "bots_only":
            raise ValueError("Bot-only simulations run on the backend and do not accept browser actions.")
        if room.get("state") == ROOM_STATE_FINISHED:
            raise ValueError("Game room is finished.")
        state = _decode_state(room.get("game_state"))
        if state.get("mode") not in {"goldfishing", "solo_bots", "bots_only"}:
            raise ValueError("This room does not contain a playable Chronicle game.")
        require_human_action(state, payload)
        state = perform_action(state, action, payload)
        state = advance_bot_players(state)
        room["game_state"] = json.dumps(state)
        if self.redis is None:
            self._memory_rooms[room_id] = room
        else:
            await self.redis.hset(_room_key(room_id), mapping=room)
        return public_game_state(state)

    async def get_room(self, *, room_id: str, user: User) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            return None
        return _public_room(room)

    async def enqueue_end_room(self, *, room_id: str, user: User) -> dict[str, Any]:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            raise LookupError("Game room not found.")
        if room.get("state") == ROOM_STATE_FINISHED:
            return _public_room(room)
        command = {
            "action": "finish_room",
            "room_id": room_id,
            "user_id": user.id,
            "requested_at": _now_iso(),
        }
        if self.redis is None:
            await self.finish_room(room_id=room_id, user_id=user.id)
        else:
            await self.redis.xadd(COMMAND_STREAM_KEY, command, maxlen=1000, approximate=True)
        return _public_room(room)

    async def finish_room(self, *, room_id: str, user_id: str) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user_id:
            return None
        if room.get("state") == ROOM_STATE_FINISHED:
            return await self.get_result(room_id=room_id, user_id=user_id)
        now = _now_iso()
        result = {
            "id": room_id,
            "room_id": room_id,
            "user_id": user_id,
            "mode": room.get("mode", "solo"),
            "game_type": room.get("game_type", DEFAULT_GAME_TYPE),
            "outcome": "completed",
            "maturity": "128",
            "turns": "8",
            "duration_seconds": str(max(1, int(time.time() - _iso_to_epoch(room.get("started_at"))))),
            "summary": "Chronicle solo room ended before the empire engine is implemented.",
            "created_at": now,
        }
        room.update({"state": ROOM_STATE_FINISHED, "ended_at": now, "result_id": room_id})
        if self.redis is None:
            self._memory_rooms[room_id] = room
            self._memory_results[room_id] = result
            self._memory_history.setdefault(user_id, [])
            if room_id not in self._memory_history[user_id]:
                self._memory_history[user_id].append(room_id)
            return self._public_result(result)
        await self.redis.hset(_room_key(room_id), mapping=room)
        await self.redis.hset(_result_key(room_id), mapping=result)
        await self.redis.zadd(_history_key(user_id), {room_id: time.time()})
        return self._public_result(result)

    async def get_result(self, *, room_id: str, user_id: str) -> dict[str, Any] | None:
        result = await self._load_result(room_id)
        if not result or result.get("user_id") != user_id:
            return None
        return self._public_result(result)

    async def list_history(self, *, user_id: str, limit: int = 25) -> list[dict[str, Any]]:
        normalized_limit = max(1, min(100, int(limit or 25)))
        if self.redis is None:
            room_ids = list(reversed(self._memory_history.get(user_id, [])))[:normalized_limit]
        else:
            room_ids = await self.redis.zrevrange(_history_key(user_id), 0, normalized_limit - 1)
        results: list[dict[str, Any]] = []
        for room_id in room_ids:
            result = await self.get_result(room_id=str(room_id), user_id=user_id)
            if result is not None:
                results.append(result)
        return results

    async def _load_room(self, room_id: str) -> dict[str, Any] | None:
        if self.redis is None:
            return self._memory_rooms.get(room_id)
        room = await self.redis.hgetall(_room_key(room_id))
        return dict(room) if room else None

    async def _load_result(self, room_id: str) -> dict[str, Any] | None:
        if self.redis is None:
            return self._memory_results.get(room_id)
        result = await self.redis.hgetall(_result_key(room_id))
        return dict(result) if result else None

    def _public_result(self, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": result.get("id", ""),
            "room_id": result.get("room_id", ""),
            "mode": result.get("mode", "solo"),
            "game_type": result.get("game_type", DEFAULT_GAME_TYPE),
            "outcome": result.get("outcome", "completed"),
            "maturity": int(result.get("maturity") or 0),
            "turns": int(result.get("turns") or 0),
            "duration_seconds": int(result.get("duration_seconds") or 0),
            "summary": result.get("summary", ""),
            "created_at": result.get("created_at", ""),
        }


class GameWorker:
    def __init__(self, service: GameRoomService, *, stream_key: str = COMMAND_STREAM_KEY) -> None:
        self.service = service
        self.stream_key = stream_key
        self._task: Optional[asyncio.Task] = None
        self._stopped = asyncio.Event()
        self._last_id = "0-0"

    def start(self) -> None:
        self._stopped.clear()
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while not self._stopped.is_set():
            redis = self.service.redis
            if redis is None:
                await asyncio.sleep(1)
                continue
            try:
                entries = await redis.xread({self.stream_key: self._last_id}, count=10, block=1000)
                for _stream_name, messages in entries or []:
                    for message_id, fields in messages:
                        self._last_id = message_id
                        await self._handle(fields)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print(f"[game-worker] command processing failed: {exc}")
                await asyncio.sleep(1)

    async def _handle(self, fields: dict[str, Any]) -> None:
        action = str(fields.get("action") or "")
        if action == "finish_room":
            await self.service.finish_room(
                room_id=str(fields.get("room_id") or ""),
                user_id=str(fields.get("user_id") or ""),
            )
        elif action == "simulate_bot_room":
            await self.service.run_bot_simulation_job(
                room_id=str(fields.get("room_id") or ""),
                user_id=str(fields.get("user_id") or ""),
            )


def _iso_to_epoch(value: Any) -> float:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return time.time()


def _decode_state(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        decoded = json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}
