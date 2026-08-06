from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .admin_router import require_admin
from .database import get_db
from .db_models import GameReplayRecord
from .replay_service import list_replays, replay_statistics, replay_summary
from .schemas import ReplayStatisticsRequest
from .security import get_current_user
from .server_models import User


router = APIRouter()


@router.get("/game/replays")
async def game_replays(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [replay_summary(row) for row in list_replays(db, owner_user_id=current_user.id)]


@router.get("/game/replays/{replay_id}")
async def game_replay(replay_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(GameReplayRecord, replay_id)
    if row is None or (row.owner_user_id != current_user.id and not current_user.is_admin):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay not found.")
    return {"summary": replay_summary(row), "replay": row.replay or {}}


@router.delete("/game/replays/{replay_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_game_replay(
    replay_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.get(GameReplayRecord, replay_id)
    if row is None or (row.owner_user_id != current_user.id and not current_user.is_admin):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay not found.")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/replays")
async def admin_replays(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [replay_summary(row) for row in list_replays(db)]


@router.post("/admin/replays/statistics")
async def admin_replay_statistics(
    payload: ReplayStatisticsRequest,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = list_replays(db)
    if payload.replay_ids:
        selected = set(payload.replay_ids)
        rows = [row for row in rows if row.id in selected]
    return replay_statistics(rows)
