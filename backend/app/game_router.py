from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from .empire_catalog import list_catalog_records
from .goldfishing_engine import build_goldfishing_state, public_catalog_entry
from .runtime_state import get_game_room_service
from .schemas import (
    GameHistoryResponse,
    GameResultResponse,
    GameRoomCreateRequest,
    GameRoomResponse,
    GoldfishingActionRequest,
)
from .security import get_current_user
from .server_models import User


router = APIRouter()


def _service():
    service = get_game_room_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Game room service is unavailable.")
    return service


@router.post("/game/rooms", response_model=GameRoomResponse)
async def create_game_room(
    payload: GameRoomCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        if payload.mode not in {"goldfishing", "solo_bots"}:
            raise ValueError("Game mode must be goldfishing or solo_bots.")
        service = _service()
        cards = [public_catalog_entry(entry) for entry in list_catalog_records(db, "cards")]
        tags = [public_catalog_entry(entry) for entry in list_catalog_records(db, "tags")]
        events = [public_catalog_entry(entry) for entry in list_catalog_records(db, "events")]
        ministries = [public_catalog_entry(entry) for entry in list_catalog_records(db, "ministries")]
        pillars = [public_catalog_entry(entry) for entry in list_catalog_records(db, "pillars")]
        tokens = [public_catalog_entry(entry) for entry in list_catalog_records(db, "tokens")]
        effect_icons = [public_catalog_entry(entry) for entry in list_catalog_records(db, "effect-icons")]
        images = [public_catalog_entry(entry) for entry in list_catalog_records(db, "images")]
        agendas = [public_catalog_entry(entry) for entry in list_catalog_records(db, "agendas")]
        decks = list_catalog_records(db, "decks")
        levels = list_catalog_records(db, "levels")
        level = _deck_by_id(levels, payload.level_id) or _latest_record(levels)
        if level is None:
            raise ValueError("No level is configured.")
        level_data = getattr(level, "data", {}) or {}
        empire_deck = _deck_by_id(decks, level_data.get("empire_deck_id"))
        crisis_deck = _deck_by_id(decks, level_data.get("crisis_deck_id"))
        if empire_deck is None or str((getattr(empire_deck, "data", {}) or {}).get("deck_type") or "") != "empire":
            raise ValueError("The selected level has no valid Empire deck.")
        if crisis_deck is None or str((getattr(crisis_deck, "data", {}) or {}).get("deck_type") or "") != "crisis":
            raise ValueError("The selected level has no valid Crisis deck.")
        initial_city_card_id = str(level_data.get("initial_city_card_id") or "capital-foundation")
        room_id = service.new_room_id()
        game_state = build_goldfishing_state(
            room_id=room_id,
            card_entries=cards,
            tag_entries=tags,
            empire_deck_ids=_deck_item_ids(empire_deck),
            crisis_deck_ids=_deck_item_ids(crisis_deck),
            setup_pool_ids=_deck_setup_ids(empire_deck, player_count=payload.player_count),
            empire_deck_id=str(getattr(empire_deck, "id", "") or ""),
            crisis_deck_id=str(getattr(crisis_deck, "id", "") or ""),
            initial_city_card_id=initial_city_card_id,
            level_id=str(getattr(level, "id", "") or ""),
            suspicion_start_era=max(1, int(level_data.get("suspicion_start_era") or 5)),
            player_count=payload.player_count,
            mode=payload.mode,
            human_player_name=current_user.username or current_user.email or "You",
            event_entries=events,
            agenda_entries=agendas,
            ministry_entries=ministries,
            pillar_entries=pillars,
            token_entries=tokens,
            effect_icon_entries=effect_icons,
            image_entries=images,
        )
        return await service.create_room(
            user=current_user,
            game_type=payload.game_type,
            game_state=game_state,
            room_id=room_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/game/rooms/{room_id}", response_model=GameRoomResponse)
async def get_game_room(room_id: str, current_user: User = Depends(get_current_user)):
    room = await _service().get_room(room_id=room_id, user=current_user)
    if room is None:
        raise HTTPException(status_code=404, detail="Game room not found.")
    return room


@router.get("/game/levels")
async def list_game_levels(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    del current_user
    levels = [public_catalog_entry(entry) for entry in list_catalog_records(db, "levels")]
    cards = {entry.id: public_catalog_entry(entry) for entry in list_catalog_records(db, "cards")}
    decks = {entry.id: public_catalog_entry(entry) for entry in list_catalog_records(db, "decks")}
    return [
        {
            "id": level["id"],
            "name": level["name"],
            "summary": level.get("summary") or "",
            "initial_city_card_id": (level.get("data") or {}).get("initial_city_card_id") or "",
            "initial_city_name": cards.get((level.get("data") or {}).get("initial_city_card_id"), {}).get("name") or "",
            "empire_deck_id": (level.get("data") or {}).get("empire_deck_id") or "",
            "empire_deck_name": decks.get((level.get("data") or {}).get("empire_deck_id"), {}).get("name") or "",
            "crisis_deck_id": (level.get("data") or {}).get("crisis_deck_id") or "",
            "crisis_deck_name": decks.get((level.get("data") or {}).get("crisis_deck_id"), {}).get("name") or "",
        }
        for level in levels
    ]


@router.post("/game/rooms/{room_id}/end", response_model=GameRoomResponse)
async def end_game_room(room_id: str, current_user: User = Depends(get_current_user)):
    try:
        return await _service().enqueue_end_room(room_id=room_id, user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/game/rooms/{room_id}/state")
async def get_game_state(room_id: str, current_user: User = Depends(get_current_user)):
    state_payload = await _service().get_game_state(room_id=room_id, user=current_user)
    if state_payload is None:
        raise HTTPException(status_code=404, detail="Game room not found.")
    return state_payload


@router.post("/game/rooms/{room_id}/actions")
async def perform_game_action(
    room_id: str,
    payload: GoldfishingActionRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, payload.action, payload.payload)


@router.get("/game/results/{room_id}", response_model=GameResultResponse)
async def get_game_result(room_id: str, current_user: User = Depends(get_current_user)):
    result = await _service().get_result(room_id=room_id, user_id=current_user.id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game result not found.")
    return result


@router.get("/game/history", response_model=GameHistoryResponse)
async def get_game_history(current_user: User = Depends(get_current_user)):
    return GameHistoryResponse(results=await _service().list_history(user_id=current_user.id))


async def _apply_action(room_id: str, user: User, action: str, payload: dict):
    try:
        return await _service().apply_goldfishing_action(
            room_id=room_id,
            user=user,
            action=action,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _latest_record(records: list):
    if not records:
        return None
    return max(records, key=lambda record: getattr(record, "updated_at", None) or getattr(record, "created_at", None))


def _deck_by_id(decks: list, deck_id: str | None):
    normalized = str(deck_id or "").strip()
    if not normalized:
        return None
    return next((deck for deck in decks if getattr(deck, "id", "") == normalized), None)


def _deck_item_ids(deck) -> list[str]:
    if not deck:
        return []
    data = getattr(deck, "data", {}) or {}
    item_ids = data.get("item_ids") or []
    return [str(item_id) for item_id in item_ids if str(item_id or "").strip()]


def _deck_setup_ids(deck, *, player_count: int) -> list[str]:
    if not deck:
        return []
    initial_setup = (getattr(deck, "data", {}) or {}).get("initial_setup") or {}
    setup_ids: list[str] = []
    for tier in range(3, max(3, min(5, player_count)) + 1):
        setup_ids.extend(
            str(item_id)
            for item_id in initial_setup.get(str(tier), [])
            if str(item_id or "").strip()
        )
    return setup_ids
