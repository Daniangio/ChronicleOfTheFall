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
        service = _service()
        cards = [public_catalog_entry(entry) for entry in list_catalog_records(db, "cards")]
        tags = [public_catalog_entry(entry) for entry in list_catalog_records(db, "tags")]
        events = [public_catalog_entry(entry) for entry in list_catalog_records(db, "events")]
        ministries = [public_catalog_entry(entry) for entry in list_catalog_records(db, "ministries")]
        pillars = [public_catalog_entry(entry) for entry in list_catalog_records(db, "pillars")]
        effect_icons = [public_catalog_entry(entry) for entry in list_catalog_records(db, "effect-icons")]
        images = [public_catalog_entry(entry) for entry in list_catalog_records(db, "images")]
        agendas = [public_catalog_entry(entry) for entry in list_catalog_records(db, "agendas")]
        empire_decks = list_catalog_records(db, "empire-decks")
        event_decks = list_catalog_records(db, "event-decks")
        levels = list_catalog_records(db, "levels")
        level = _deck_by_id(levels, payload.level_id) or _latest_record(levels)
        level_data = getattr(level, "data", {}) or {}
        card_deck = (
            _deck_by_id(empire_decks, payload.empire_deck_id)
            or _deck_by_id(empire_decks, level_data.get("empire_deck_id"))
            or _latest_record(empire_decks)
        )
        event_deck = (
            _deck_by_id(event_decks, payload.event_deck_id)
            or _deck_by_id(event_decks, level_data.get("event_deck_id"))
            or _latest_record(event_decks)
        )
        common_pool_deck = _deck_by_id(empire_decks, level_data.get("common_pool_deck_id"))
        initial_city_card_id = str(level_data.get("initial_city_card_id") or "capital-foundation")
        room_id = service.new_room_id()
        game_state = build_goldfishing_state(
            room_id=room_id,
            card_entries=cards,
            tag_entries=tags,
            card_deck_ids=_deck_item_ids(card_deck) if card_deck else _fallback_card_ids(cards),
            event_deck_ids=_deck_item_ids(event_deck),
            common_pool_ids=_deck_item_ids(common_pool_deck),
            card_deck_id=str(getattr(card_deck, "id", "") or ""),
            event_deck_id=str(getattr(event_deck, "id", "") or ""),
            initial_city_card_id=initial_city_card_id,
            level_id=str(getattr(level, "id", "") or ""),
            common_pool_deck_id=str(getattr(common_pool_deck, "id", "") or ""),
            event_entries=events,
            agenda_entries=agendas,
            ministry_entries=ministries,
            pillar_entries=pillars,
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
    empire_decks = {entry.id: public_catalog_entry(entry) for entry in list_catalog_records(db, "empire-decks")}
    event_decks = {entry.id: public_catalog_entry(entry) for entry in list_catalog_records(db, "event-decks")}
    return [
        {
            "id": level["id"],
            "name": level["name"],
            "summary": level.get("summary") or "",
            "initial_city_card_id": (level.get("data") or {}).get("initial_city_card_id") or "",
            "initial_city_name": cards.get((level.get("data") or {}).get("initial_city_card_id"), {}).get("name") or "",
            "empire_deck_id": (level.get("data") or {}).get("empire_deck_id") or "",
            "empire_deck_name": empire_decks.get((level.get("data") or {}).get("empire_deck_id"), {}).get("name") or "",
            "event_deck_id": (level.get("data") or {}).get("event_deck_id") or "",
            "event_deck_name": event_decks.get((level.get("data") or {}).get("event_deck_id"), {}).get("name") or "",
            "common_pool_deck_id": (level.get("data") or {}).get("common_pool_deck_id") or "",
            "common_pool_deck_name": empire_decks.get((level.get("data") or {}).get("common_pool_deck_id"), {}).get("name") or "",
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


def _fallback_card_ids(cards: list[dict]) -> list[str]:
    ids = [card["id"] for card in cards if card.get("id") != "capital-foundation"]
    if not ids:
        return []
    repeated = []
    while len(repeated) < 20:
        repeated.extend(ids)
    return repeated[:20]
