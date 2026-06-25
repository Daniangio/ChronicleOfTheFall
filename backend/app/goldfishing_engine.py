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
        _decay_phase(state)
        for player in players:
            player["passed"] = False
        state["active_player_id"] = players[0]["id"]
        state.setdefault("log", []).append("All players passed. Decay resolved and Administration refreshed.")
        return state
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
    if card_id not in active.get("hand", []):
        raise ValueError("Card is not in this player's hand.")
    if len(state.get("projects", [])) >= PROJECT_LIMIT:
        discarded = state["projects"].pop(0)
        try:
            discarded_card = card_by_id(state, discarded.get("card_id", ""))
            state.setdefault("log", []).append(f"{discarded_card['name']} was discarded from the full project queue.")
        except ValueError:
            state.setdefault("log", []).append("The oldest project was discarded from the full project queue.")
    active["hand"].remove(card_id)
    state.setdefault("projects", []).append(
        {"id": f"project-{uuid.uuid4().hex[:8]}", "card_id": card_id, "contributions": {}}
    )
    active["passed"] = False
    active["mana"] = {}
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
    node = _manual_action_node(card) or _legacy_exhaust_node(card)
    if node is None:
        raise ValueError("Card does not have a manual action.")
    if not _preconditions_met(state, node, city=city, card_id=card_id, player=active):
        raise ValueError("Card action preconditions are not met.")
    _execute_effects(state, node.get("effects") or [], city=city, card_id=card_id, player=active)
    active["passed"] = False
    state.setdefault("log", []).append(f"{active['name']} exhausted {card['name']}.")
    if bool(node.get("ends_turn")):
        active["mana"] = {}
        return advance_turn(state)
    return state


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
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
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
    return state


def pass_turn(state: dict[str, Any], *, player_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    active["passed"] = True
    active["mana"] = {}
    state.setdefault("log", []).append(f"{active['name']} passed.")
    return advance_turn(state)


def _decay_phase(state: dict[str, Any]) -> None:
    city = _city(state, "capital")
    remaining_projects = []
    for project in state.get("projects", []):
        try:
            card = card_by_id(state, project.get("card_id", ""))
        except ValueError:
            continue
        if _project_complete(card, project):
            city.setdefault("cards", []).append(card["id"])
            state.setdefault("log", []).append(f"{card['name']} was built in {city['name']} during Decay.")
        else:
            project["contributions"] = {}
            remaining_projects.append(project)
    state["projects"] = remaining_projects
    for city_entry in state.get("cities", []):
        city_entry["exhausted_card_ids"] = []
    for player in state.get("players", []):
        player["mana"] = {}


def _project_complete(card: dict[str, Any], project: dict[str, Any]) -> bool:
    cost = card.get("data", {}).get("cost") or {}
    if not cost:
        return True
    contributions = project.get("contributions") or {}
    return all(int(contributions.get(tag_id, 0)) >= int(amount) for tag_id, amount in cost.items())


def _manual_action_node(card: dict[str, Any]) -> dict[str, Any] | None:
    for node in card.get("data", {}).get("logic_nodes") or []:
        if node.get("trigger") == "manual_action":
            return node
    return None


def _legacy_exhaust_node(card: dict[str, Any]) -> dict[str, Any] | None:
    exhaust = card.get("data", {}).get("exhaust") or {}
    if not exhaust:
        return None
    return {
        "name": "Exhaust",
        "trigger": "manual_action",
        "ends_turn": False,
        "preconditions": {
            "logic_gate": "AND",
            "conditions": [
                {"target": "this_card", "variable": "is_exhausted", "operator": "==", "value": False}
            ],
        },
        "effects": [
            {"effect_type": "set_state", "payload": {"variable": "is_exhausted", "value": True}},
            *[
                {"effect_type": "modify_mana", "payload": {"mana_type": tag_id, "amount": amount}}
                for tag_id, amount in exhaust.items()
            ],
        ],
    }


def _preconditions_met(
    state: dict[str, Any],
    node: dict[str, Any],
    *,
    city: dict[str, Any],
    card_id: str,
    player: dict[str, Any],
) -> bool:
    preconditions = node.get("preconditions") or {}
    conditions = preconditions.get("conditions") or []
    if not conditions:
        return True
    results = [
        _condition_met(state, condition, city=city, card_id=card_id, player=player)
        for condition in conditions
    ]
    if preconditions.get("logic_gate") == "OR":
        return any(results)
    return all(results)


def _condition_met(
    state: dict[str, Any],
    condition: dict[str, Any],
    *,
    city: dict[str, Any],
    card_id: str,
    player: dict[str, Any],
) -> bool:
    actual = _condition_value(state, condition, city=city, card_id=card_id, player=player)
    expected = condition.get("value")
    operator = condition.get("operator") or "=="
    if operator == "==":
        return actual == expected
    if operator == "!=":
        return actual != expected
    if operator == ">=":
        return _number(actual) >= _number(expected)
    if operator == "<=":
        return _number(actual) <= _number(expected)
    if operator == ">":
        return _number(actual) > _number(expected)
    if operator == "<":
        return _number(actual) < _number(expected)
    return False


def _condition_value(
    state: dict[str, Any],
    condition: dict[str, Any],
    *,
    city: dict[str, Any],
    card_id: str,
    player: dict[str, Any],
) -> Any:
    target = condition.get("target")
    variable = str(condition.get("variable") or "")
    if target == "this_card":
        if variable == "is_exhausted":
            return card_id in city.get("exhausted_card_ids", [])
        card = card_by_id(state, card_id)
        return int((card.get("data", {}).get("tokens") or {}).get(variable, 0))
    if target == "player":
        if variable == "mana":
            return sum(int(amount) for amount in (player.get("mana") or {}).values())
        return int((player.get("mana") or {}).get(variable, 0))
    if target == "local_city":
        if variable == "is_exhausted":
            return False
        return _count_city_token(state, city, variable)
    if target == "global":
        return _count_global_token(state, variable)
    return None


def _execute_effects(
    state: dict[str, Any],
    effects: list[dict[str, Any]],
    *,
    city: dict[str, Any],
    card_id: str,
    player: dict[str, Any],
) -> None:
    for effect in effects:
        payload = effect.get("payload") or {}
        effect_type = effect.get("effect_type")
        if effect_type == "set_state" and payload.get("variable") == "is_exhausted":
            if bool(payload.get("value")):
                if card_id not in city.setdefault("exhausted_card_ids", []):
                    city["exhausted_card_ids"].append(card_id)
            else:
                city["exhausted_card_ids"] = [entry for entry in city.get("exhausted_card_ids", []) if entry != card_id]
        elif effect_type == "modify_mana":
            mana_type = str(payload.get("mana_type") or payload.get("tag_id") or "")
            if not mana_type:
                continue
            amount = int(payload.get("amount") or 0)
            player.setdefault("mana", {})[mana_type] = int(player.get("mana", {}).get(mana_type, 0)) + amount
            if player["mana"][mana_type] <= 0:
                del player["mana"][mana_type]
        elif effect_type == "modify_token":
            _modify_token(state, payload, city=city, card_id=card_id)


def _modify_token(state: dict[str, Any], payload: dict[str, Any], *, city: dict[str, Any], card_id: str) -> None:
    token = str(payload.get("token") or "")
    if not token:
        return
    amount = int(payload.get("amount") or 0)
    target = payload.get("target") or "this_card"
    if target == "this_card":
        card = card_by_id(state, card_id)
        tokens = {**(card.get("data", {}).get("tokens") or {})}
        tokens[token] = int(tokens.get(token, 0)) + amount
        if tokens[token] <= 0:
            del tokens[token]
        card.setdefault("data", {})["tokens"] = tokens
    elif target == "local_city":
        tokens = {**(city.get("tokens") or {})}
        tokens[token] = int(tokens.get(token, 0)) + amount
        if tokens[token] <= 0:
            del tokens[token]
        city["tokens"] = tokens
    elif target == "global":
        tokens = {**(state.get("global_tokens") or {})}
        tokens[token] = int(tokens.get(token, 0)) + amount
        if tokens[token] <= 0:
            del tokens[token]
        state["global_tokens"] = tokens


def _count_city_token(state: dict[str, Any], city: dict[str, Any], token: str) -> int:
    total = int((city.get("tokens") or {}).get(token, 0))
    for card_id in [city.get("foundation_card_id"), *city.get("cards", [])]:
        if not card_id:
            continue
        try:
            card = card_by_id(state, card_id)
        except ValueError:
            continue
        data = card.get("data", {})
        total += int((data.get("tokens") or {}).get(token, 0))
        if token in (data.get("tags") or []):
            total += 1
    return total


def _count_global_token(state: dict[str, Any], token: str) -> int:
    total = int((state.get("global_tokens") or {}).get(token, 0))
    for city in state.get("cities", []):
        total += _count_city_token(state, city, token)
    return total


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


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
