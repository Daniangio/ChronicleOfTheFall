from __future__ import annotations

import random
import uuid
from copy import deepcopy
from typing import Any


MANA_TAGS = {"labor", "wealth", "influence"}
PROJECT_LIMIT = 3
PLAYER_COUNT = 4


def public_catalog_entry(entry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "name": entry.name,
        "kind": entry.kind,
        "category": entry.category,
        "summary": entry.summary,
        "color": entry.color,
        "data": entry.data or {},
    }


def build_goldfishing_state(
    *,
    room_id: str,
    card_entries: list[dict[str, Any]],
    tag_entries: list[dict[str, Any]],
    card_deck_ids: list[str],
    event_deck_ids: list[str],
    card_deck_id: str,
    event_deck_id: str,
) -> dict[str, Any]:
    card_by_id = {entry["id"]: entry for entry in card_entries}
    draw_deck = [
        card_id
        for card_id in card_deck_ids
        if card_id in card_by_id and card_id != "capital-foundation"
    ]
    random.Random(room_id).shuffle(draw_deck)
    players = []
    for index in range(PLAYER_COUNT):
        hand = draw_deck[:4]
        draw_deck = draw_deck[4:]
        players.append(
            {
                "id": f"player-{index + 1}",
                "name": f"Player {index + 1}",
                "hand": hand,
                "mana": {},
                "passed": False,
            }
        )
    return {
        "mode": "goldfishing",
        "room_id": room_id,
        "epoch": 1,
        "active_player_id": "player-1",
        "players": players,
        "projects": [],
        "cities": [
            {
                "id": "capital",
                "name": "Capital",
                "foundation_card_id": "capital-foundation",
                "cards": [],
                "exhausted_card_ids": [],
            }
        ],
        "draw_deck": draw_deck,
        "event_deck": event_deck_ids,
        "event_queue": [],
        "catalog": {
            "cards": card_entries,
            "tags": tag_entries,
        },
        "decks": {
            "cards": card_deck_id,
            "events": event_deck_id,
        },
        "log": ["Goldfishing setup complete. Capital placed. Each player drew 4 cards."],
    }


def get_active_player(state: dict[str, Any]) -> dict[str, Any]:
    player_id = state.get("active_player_id")
    for player in state.get("players", []):
        if player.get("id") == player_id:
            return player
    raise ValueError("Active player not found.")


def card_by_id(state: dict[str, Any], card_id: str) -> dict[str, Any]:
    for card in state.get("catalog", {}).get("cards", []):
        if card.get("id") == card_id:
            return card
    raise ValueError("Card not found.")


def advance_turn(state: dict[str, Any]) -> dict[str, Any]:
    players = state.get("players", [])
    if not players:
        return state
    if all(player.get("passed") for player in players):
        for player in players:
            player["passed"] = False
        state.setdefault("log", []).append("All players passed. Administration loop refreshed.")
    current_index = next(
        (index for index, player in enumerate(players) if player.get("id") == state.get("active_player_id")),
        0,
    )
    for offset in range(1, len(players) + 1):
        candidate = players[(current_index + offset) % len(players)]
        if not candidate.get("passed"):
            state["active_player_id"] = candidate["id"]
            return state
    state["active_player_id"] = players[0]["id"]
    return state


def propose_project(state: dict[str, Any], *, player_id: str, card_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    if len(state.get("projects", [])) >= PROJECT_LIMIT:
        raise ValueError("Project zone is full.")
    if card_id not in active.get("hand", []):
        raise ValueError("Card is not in this player's hand.")
    active["hand"].remove(card_id)
    state.setdefault("projects", []).append(
        {"id": f"project-{uuid.uuid4().hex[:8]}", "card_id": card_id, "contributions": {}}
    )
    active["passed"] = False
    state.setdefault("log", []).append(f"{active['name']} proposed {card_by_id(state, card_id)['name']}.")
    return advance_turn(state)


def exhaust_card(state: dict[str, Any], *, player_id: str, city_id: str, card_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    city = _city(state, city_id)
    in_city = card_id == city.get("foundation_card_id") or card_id in city.get("cards", [])
    if not in_city:
        raise ValueError("Card is not in this city.")
    if card_id in city.get("exhausted_card_ids", []):
        raise ValueError("Card is already exhausted.")
    card = card_by_id(state, card_id)
    exhaust = card.get("data", {}).get("exhaust") or {}
    if not exhaust:
        raise ValueError("Card does not produce mana.")
    for tag_id, amount in exhaust.items():
        active.setdefault("mana", {})[tag_id] = int(active.get("mana", {}).get(tag_id, 0)) + int(amount)
    city.setdefault("exhausted_card_ids", []).append(card_id)
    active["passed"] = False
    state.setdefault("log", []).append(f"{active['name']} exhausted {card['name']}.")
    return advance_turn(state)


def assign_mana(
    state: dict[str, Any],
    *,
    player_id: str,
    project_id: str,
    tag_id: str,
    amount: int,
    city_id: str = "capital",
) -> dict[str, Any]:
    state = deepcopy(state)
    player = _player(state, player_id)
    normalized_amount = max(1, int(amount or 1))
    available = int(player.get("mana", {}).get(tag_id, 0))
    if available < normalized_amount:
        raise ValueError("Not enough mana.")
    project = _project(state, project_id)
    card = card_by_id(state, project["card_id"])
    required = int((card.get("data", {}).get("cost") or {}).get(tag_id, 0))
    current = int(project.get("contributions", {}).get(tag_id, 0))
    if required and current >= required:
        raise ValueError("This project does not need more of that mana.")
    assignable = min(normalized_amount, max(0, required - current) if required else normalized_amount)
    player["mana"][tag_id] = available - assignable
    if player["mana"][tag_id] <= 0:
        del player["mana"][tag_id]
    project.setdefault("contributions", {})[tag_id] = current + assignable
    state.setdefault("log", []).append(f"{player['name']} assigned {assignable} {tag_id}.")
    if _project_complete(card, project):
        city = _city(state, city_id)
        city.setdefault("cards", []).append(card["id"])
        state["projects"] = [entry for entry in state.get("projects", []) if entry.get("id") != project_id]
        state.setdefault("log", []).append(f"{card['name']} was built in {city['name']}.")
    return state


def pass_turn(state: dict[str, Any], *, player_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    active["passed"] = True
    state.setdefault("log", []).append(f"{active['name']} passed.")
    return advance_turn(state)


def _project_complete(card: dict[str, Any], project: dict[str, Any]) -> bool:
    cost = card.get("data", {}).get("cost") or {}
    if not cost:
        return True
    contributions = project.get("contributions") or {}
    return all(int(contributions.get(tag_id, 0)) >= int(amount) for tag_id, amount in cost.items())


def _city(state: dict[str, Any], city_id: str) -> dict[str, Any]:
    for city in state.get("cities", []):
        if city.get("id") == city_id:
            return city
    raise ValueError("City not found.")


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    for player in state.get("players", []):
        if player.get("id") == player_id:
            return player
    raise ValueError("Player not found.")


def _project(state: dict[str, Any], project_id: str) -> dict[str, Any]:
    for project in state.get("projects", []):
        if project.get("id") == project_id:
            return project
    raise ValueError("Project not found.")
