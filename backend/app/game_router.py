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
    GoldfishingAssignManaRequest,
    GoldfishingBuildProjectRequest,
    GoldfishingExhaustRequest,
    GoldfishingMinistryResourceRequest,
    GoldfishingPassRequest,
    GoldfishingPeekEventRequest,
    GoldfishingProposeRequest,
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
        deck_records = list_catalog_records(db, "decks")
        card_deck = _deck_by_id(deck_records, payload.empire_deck_id) or _latest_deck(deck_records, "empire")
        event_deck = _deck_by_id(deck_records, payload.event_deck_id) or _latest_deck(deck_records, "events")
        common_pool_deck = _latest_deck(deck_records, "common-pool")
        room_id = service.new_room_id()
        game_state = build_goldfishing_state(
            room_id=room_id,
            card_entries=cards,
            tag_entries=tags,
            card_deck_ids=_deck_item_ids(card_deck) or _fallback_card_ids(cards),
            event_deck_ids=_deck_item_ids(event_deck) or [event["id"] for event in events],
            common_pool_ids=_deck_item_ids(common_pool_deck),
            card_deck_id=str(getattr(card_deck, "id", "") or ""),
            event_deck_id=str(getattr(event_deck, "id", "") or ""),
            common_pool_deck_id=str(getattr(common_pool_deck, "id", "") or ""),
            event_entries=events,
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


@router.get("/game/decks")
async def list_game_decks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    del current_user
    decks = [public_catalog_entry(entry) for entry in list_catalog_records(db, "decks")]
    return [
        {
            "id": deck["id"],
            "name": deck["name"],
            "deck_type": (deck.get("data") or {}).get("deck_type") or deck.get("category") or "",
            "item_count": len((deck.get("data") or {}).get("item_ids") or []),
        }
        for deck in decks
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


@router.post("/game/rooms/{room_id}/actions/propose")
async def propose_game_project(
    room_id: str,
    payload: GoldfishingProposeRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "propose_project", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/exhaust")
async def exhaust_game_card(
    room_id: str,
    payload: GoldfishingExhaustRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "exhaust_card", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/assign-mana")
async def assign_game_mana(
    room_id: str,
    payload: GoldfishingAssignManaRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "assign_mana", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/build-project")
async def build_game_project(
    room_id: str,
    payload: GoldfishingBuildProjectRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "build_project", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/ministry-resource")
async def use_game_ministry_resource(
    room_id: str,
    payload: GoldfishingMinistryResourceRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "use_ministry_resource", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/peek-event")
async def peek_game_event(
    room_id: str,
    payload: GoldfishingPeekEventRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "peek_event", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/pass")
async def pass_game_turn(
    room_id: str,
    payload: GoldfishingPassRequest,
    current_user: User = Depends(get_current_user),
):
    return await _apply_action(room_id, current_user, "pass_turn", payload.model_dump())


@router.post("/game/rooms/{room_id}/actions/continue-phase")
async def continue_game_phase(room_id: str, current_user: User = Depends(get_current_user)):
    return await _apply_action(room_id, current_user, "continue_phase", {})


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


def _latest_deck(decks: list, deck_type: str):
    candidates = [
        deck
        for deck in decks
        if getattr(deck, "category", "") == deck_type or (getattr(deck, "data", {}) or {}).get("deck_type") == deck_type
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda deck: getattr(deck, "updated_at", None) or getattr(deck, "created_at", None))


def _deck_by_id(decks: list, deck_id: str | None):
    normalized = str(deck_id or "").strip()
    if not normalized:
        return None
    return next((deck for deck in decks if getattr(deck, "id", "") == normalized), None)


def _deck_item_ids(deck) -> list[str]:
    if not deck:
        return []
    data = getattr(deck, "data", {}) or {}
    item_ids = data.get("item_ids") or data.get("card_ids") or data.get("event_ids") or []
    return [str(item_id) for item_id in item_ids if str(item_id or "").strip()]


def _fallback_card_ids(cards: list[dict]) -> list[str]:
    ids = [card["id"] for card in cards if card.get("id") != "capital-foundation"]
    if not ids:
        return []
    repeated = []
    while len(repeated) < 20:
        repeated.extend(ids)
    return repeated[:20]
