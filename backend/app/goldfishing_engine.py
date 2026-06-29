from __future__ import annotations

import random
import uuid
from copy import deepcopy
from typing import Any


MANA_TAGS = {"labor", "wealth", "influence"}
PROJECT_LIMIT = 3
PLAYER_COUNT = 4
INITIAL_HAND_SIZE = 3
EVENT_QUEUE_LIMIT = 3


class Deck:
    def __init__(self, card_ids: list[str]) -> None:
        self._card_ids = list(card_ids)

    def shuffle(self, seed: str) -> None:
        random.Random(seed).shuffle(self._card_ids)

    def draw(self, amount: int = 1) -> list[str]:
        drawn = self._card_ids[:amount]
        del self._card_ids[:amount]
        return drawn

    def to_list(self) -> list[str]:
        return list(self._card_ids)


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
    common_pool_ids: list[str] | None = None,
    card_deck_id: str,
    event_deck_id: str,
    common_pool_deck_id: str = "",
    event_entries: list[dict[str, Any]] | None = None,
    ministry_entries: list[dict[str, Any]] | None = None,
    pillar_entries: list[dict[str, Any]] | None = None,
    effect_icon_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    card_by_id = {entry["id"]: entry for entry in card_entries}
    draw_deck = Deck([
        card_id
        for card_id in card_deck_ids
        if card_id in card_by_id and card_id != "capital-foundation"
    ])
    common_pool = [
        card_id
        for card_id in (common_pool_ids or [])
        if card_id in card_by_id and card_id != "capital-foundation"
    ]
    draw_deck.shuffle(room_id)
    players = []
    for index in range(PLAYER_COUNT):
        players.append(
            {
                "id": f"player-{index + 1}",
                "name": f"Player {index + 1}",
                "hand": draw_deck.draw(INITIAL_HAND_SIZE),
                "mana": {},
                "passed": False,
                "turn_exhaust_used": False,
            }
        )
    ministries = ministry_entries or []
    selected_ministries = _select_ministries(players, ministries, minister_of_empire_player_id="player-1")
    return _prepare_state({
        "mode": "goldfishing",
        "room_id": room_id,
        "epoch": 1,
        "phase": "administration",
        "year_phase": "administration",
        "active_player_id": "player-1",
        "minister_of_empire_player_id": "player-1",
        "blocked_player_id": "",
        "selected_ministries": selected_ministries,
        "players": players,
        "pillars": {"treasury": 5, "stability": 5, "morale": 5},
        "common_pool": common_pool,
        "projects": [],
        "cities": [
            {
                "id": "capital",
                "name": "Capital",
                "city_card_id": "capital-foundation",
                "foundation_card_id": "capital-foundation",
                "building_slots": int((card_by_id.get("capital-foundation", {}).get("data", {}) or {}).get("building_slots") or 3),
                "cards": [],
                "exhausted_card_ids": [],
            }
        ],
        "draw_deck": draw_deck.to_list(),
        "event_deck": event_deck_ids,
        "event_queue": [],
        "catalog": {
            "cards": card_entries,
            "tags": tag_entries,
            "events": event_entries or [],
            "ministries": ministries,
            "pillars": pillar_entries or [],
            "effect_icons": effect_icon_entries or [],
        },
        "decks": {
            "cards": card_deck_id,
            "events": event_deck_id,
            "common_pool": common_pool_deck_id,
        },
        "log": [f"Goldfishing setup complete. Capital placed. Each player drew {INITIAL_HAND_SIZE} cards. Player 1 is Minister of the Empire."],
    })


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


def event_by_id(state: dict[str, Any], event_id: str) -> dict[str, Any]:
    for event in state.get("catalog", {}).get("events", []):
        if event.get("id") == event_id:
            return event
    raise ValueError("Event not found.")


def advance_turn(state: dict[str, Any]) -> dict[str, Any]:
    players = state.get("players", [])
    if not players:
        return state
    if all(player.get("passed") for player in players):
        _decay_phase(state)
        state.setdefault("log", []).append("All players passed. Administration ended.")
        return state
    current_index = next(
        (index for index, player in enumerate(players) if player.get("id") == state.get("active_player_id")),
        0,
    )
    for offset in range(1, len(players) + 1):
        candidate = players[(current_index + offset) % len(players)]
        if not candidate.get("passed"):
            state["active_player_id"] = candidate["id"]
            _start_player_turn(candidate)
            return state
    state["active_player_id"] = players[0]["id"]
    _start_player_turn(players[0])
    return state


def propose_project(state: dict[str, Any], *, player_id: str, card_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    _require_phase(state, "administration")
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    source = "hand" if card_id in active.get("hand", []) else "common_pool" if card_id in state.get("common_pool", []) else ""
    if not source:
        raise ValueError("Card is not available to propose.")
    card = card_by_id(state, card_id)
    if _card_requires_state_minister(card) and not _active_ministry(state, active).get("data", {}).get("can_propose_politics_economy"):
        raise ValueError("Only the Minister of State can propose Politics or Economy cards.")
    if len(state.get("projects", [])) >= PROJECT_LIMIT:
        discarded = state["projects"].pop(0)
        try:
            discarded_card = card_by_id(state, discarded.get("card_id", ""))
            state.setdefault("log", []).append(f"{discarded_card['name']} was discarded from the full project queue.")
        except ValueError:
            state.setdefault("log", []).append("The oldest project was discarded from the full project queue.")
    if source == "hand":
        active["hand"].remove(card_id)
    else:
        state["common_pool"].remove(card_id)
    state.setdefault("projects", []).append(
        {"id": f"project-{uuid.uuid4().hex[:8]}", "card_id": card_id, "contributions": {}}
    )
    active["passed"] = False
    source_label = "common pool" if source == "common_pool" else "hand"
    state.setdefault("log", []).append(f"{active['name']} proposed {card['name']} from {source_label}.")
    active["mana"] = {}
    return _prepare_state(advance_turn(state))


def build_project(state: dict[str, Any], *, player_id: str, project_id: str, city_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    _require_phase(state, "administration")
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    project = _project(state, project_id)
    card = card_by_id(state, project.get("card_id", ""))
    if not _project_complete(card, project):
        raise ValueError("Project is not complete.")
    if not _player_can_finalize_project(state, active):
        raise ValueError("This player's ministry cannot finalize projects.")
    if _is_city_card(card):
        if not _city_card_can_be_founded(state, card):
            raise ValueError("Project requirements are not satisfied for this city.")
        city = _create_city_from_card(state, card)
        state["projects"] = [entry for entry in state.get("projects", []) if entry.get("id") != project_id]
        active["passed"] = False
        state.setdefault("log", []).append(f"{active['name']} founded {city['name']}.")
        return _prepare_state(state)
    city = _city(state, city_id)
    if not _card_can_be_built_in_city(state, card, city):
        raise ValueError("Project requirements are not satisfied in this city.")
    city.setdefault("cards", []).append(card["id"])
    state["projects"] = [entry for entry in state.get("projects", []) if entry.get("id") != project_id]
    active["passed"] = False
    state.setdefault("log", []).append(f"{active['name']} built {card['name']} in {city['name']}.")
    return _prepare_state(state)


def exhaust_card(state: dict[str, Any], *, player_id: str, city_id: str, card_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    _require_phase(state, "administration")
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    if active.get("turn_exhaust_used"):
        raise ValueError("This player has already exhausted a card this turn.")
    city = _city(state, city_id)
    in_city = _city_has_card(city, card_id)
    if not in_city:
        raise ValueError("Card is not in this city.")
    if card_id in city.get("exhausted_card_ids", []):
        raise ValueError("Card is already exhausted.")
    card = card_by_id(state, card_id)
    node = _manual_action_node(card)
    if node is None:
        raise ValueError("Card does not have a manual action.")
    if not _preconditions_met(state, node, city=city, card_id=card_id, player=active):
        raise ValueError("Card action preconditions are not met.")
    if _node_requires_exhaust(node) and card_id not in city.setdefault("exhausted_card_ids", []):
        city["exhausted_card_ids"].append(card_id)
    _execute_effects(state, node.get("effects") or [], city=city, card_id=card_id, player=active)
    active["turn_exhaust_used"] = True
    active["passed"] = False
    state.setdefault("log", []).append(f"{active['name']} exhausted {card['name']}.")
    if bool(node.get("ends_turn")):
        active["mana"] = {}
        return _prepare_state(advance_turn(state))
    return _prepare_state(state)


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
    _require_phase(state, "administration")
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
    return _prepare_state(state)


def use_ministry_resource(state: dict[str, Any], *, player_id: str, tag_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    _require_phase(state, "administration")
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    ministry = _active_ministry(state, active)
    resources = _ministry_infrastructure_resources(ministry)
    if tag_id not in resources:
        raise ValueError("This ministry cannot produce that resource.")
    used_key = f"ministry_resource:{ministry.get('id', '')}"
    if used_key in active.setdefault("once_per_year_used", []):
        raise ValueError("This ministry resource has already been used this year.")
    active.setdefault("mana", {})[tag_id] = int(active.get("mana", {}).get(tag_id, 0)) + int(resources[tag_id])
    active["once_per_year_used"].append(used_key)
    active["passed"] = False
    state.setdefault("log", []).append(f"{active['name']} used {ministry.get('name', 'ministry')} to produce {tag_id}.")
    return _prepare_state(state)


def peek_event(state: dict[str, Any], *, player_id: str, event_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    _require_phase(state, "administration")
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    ministry = _active_ministry(state, active)
    if not (ministry.get("data", {}) or {}).get("can_peek_event_queue"):
        raise ValueError("This ministry cannot look at queued events.")
    if event_id not in state.get("event_queue", []):
        raise ValueError("Event is not in the queue.")
    used_key = f"peek_event:{ministry.get('id', '')}"
    if used_key in active.setdefault("once_per_year_used", []):
        raise ValueError("This ministry has already looked at an Event this year.")
    active["once_per_year_used"].append(used_key)
    active.setdefault("peeked_event_ids", []).append(event_id)
    active["passed"] = False
    try:
        event = event_by_id(state, event_id)
        state.setdefault("log", []).append(f"{active['name']} secretly looked at {event['name']}.")
    except ValueError:
        state.setdefault("log", []).append(f"{active['name']} secretly looked at a queued Event.")
    return _prepare_state(state)


def pass_turn(state: dict[str, Any], *, player_id: str) -> dict[str, Any]:
    state = deepcopy(state)
    _require_phase(state, "administration")
    active = get_active_player(state)
    if active["id"] != player_id:
        raise ValueError("It is not this player's turn.")
    active["passed"] = True
    active["mana"] = {}
    state.setdefault("log", []).append(f"{active['name']} passed.")
    return _prepare_state(advance_turn(state))


def continue_phase(state: dict[str, Any]) -> dict[str, Any]:
    state = deepcopy(state)
    phase = state.get("phase") or "administration"
    if phase == "decay":
        state["epoch"] = int(state.get("epoch") or 1) + 1
        _rotate_minister_of_empire(state)
        _select_year_ministries(state)
        _draw_for_all_players(state, 1)
        state["phase"] = "council"
        state["year_phase"] = "council"
        _reveal_event(state)
        state.setdefault("log", []).append("Council phase began. Ministries selected and each player drew 1 card.")
    elif phase == "council":
        state["phase"] = "administration"
        state["year_phase"] = "administration"
        players = state.get("players", [])
        for player in players:
            player["passed"] = False
            player["mana"] = {}
            _start_player_turn(player)
        state["active_player_id"] = state.get("minister_of_empire_player_id") or (players[0]["id"] if players else "")
        state.setdefault("log", []).append("Administration phase began.")
    elif phase == "crisis":
        state["phase"] = "decay"
        state["year_phase"] = "decay"
        state.setdefault("log", []).append("Crisis phase resolved. No event effects are wired in v0.")
    else:
        raise ValueError("Current phase cannot be advanced manually.")
    return _prepare_state(state)


def _prepare_state(state: dict[str, Any]) -> dict[str, Any]:
    _ensure_state_defaults(state)
    if state.get("phase") == "administration":
        _auto_pass_unactionable_players(state)
    state["possible_actions"] = _possible_actions(state)
    return state


def _ensure_state_defaults(state: dict[str, Any]) -> None:
    state.setdefault("phase", "administration")
    state.setdefault("year_phase", state.get("phase", "administration"))
    state.setdefault("event_queue", [])
    state.setdefault("event_deck", [])
    state.setdefault("common_pool", [])
    state.setdefault("possible_actions", [])
    state.setdefault("catalog", {}).setdefault("events", [])
    state.setdefault("catalog", {}).setdefault("ministries", [])
    state.setdefault("catalog", {}).setdefault("pillars", [])
    state.setdefault("catalog", {}).setdefault("effect_icons", [])
    state.setdefault("pillars", {"treasury": 5, "stability": 5, "morale": 5})
    if "minister_of_empire_player_id" not in state and state.get("players"):
        state["minister_of_empire_player_id"] = state["players"][0].get("id", "")
    state.setdefault("blocked_player_id", "")
    state.setdefault("selected_ministries", {})
    for player in state.get("players", []):
        player.setdefault("mana", {})
        player.setdefault("passed", False)
        player.setdefault("turn_exhaust_used", False)
        player.setdefault("once_per_year_used", [])
        player.setdefault("peeked_event_ids", [])


def _auto_pass_unactionable_players(state: dict[str, Any]) -> None:
    players = state.get("players", [])
    guard = 0
    while players and state.get("phase") == "administration" and guard < len(players):
        actions = _possible_actions_for_active_player(state)
        if any(action.get("type") != "pass" for action in actions):
            break
        active = get_active_player(state)
        active["passed"] = True
        active["mana"] = {}
        state.setdefault("log", []).append(f"{active['name']} auto-passed.")
        advance_turn(state)
        guard += 1


def _possible_actions(state: dict[str, Any]) -> list[dict[str, Any]]:
    phase = state.get("phase") or "administration"
    if phase in {"decay", "council", "crisis"}:
        return [{"type": "continue_phase"}]
    if phase != "administration":
        return []
    return _possible_actions_for_active_player(state)


def _possible_actions_for_active_player(state: dict[str, Any]) -> list[dict[str, Any]]:
    active = get_active_player(state)
    actions: list[dict[str, Any]] = []
    ministry = _active_ministry(state, active)
    ministry_resources = _ministry_infrastructure_resources(ministry)
    used_key = f"ministry_resource:{ministry.get('id', '')}"
    if ministry_resources and used_key not in active.get("once_per_year_used", []):
        for tag_id, amount in ministry_resources.items():
            if int(amount) > 0:
                actions.append({"type": "use_ministry_resource", "player_id": active["id"], "tag_id": tag_id, "amount": int(amount)})
    peek_key = f"peek_event:{ministry.get('id', '')}"
    if (ministry.get("data", {}) or {}).get("can_peek_event_queue") and peek_key not in active.get("once_per_year_used", []):
        for event_id in state.get("event_queue", []):
            actions.append({"type": "peek_event", "player_id": active["id"], "event_id": event_id})
    if not active.get("turn_exhaust_used"):
        for city in state.get("cities", []):
            for card_id in _city_card_ids(city):
                if not card_id or card_id in city.get("exhausted_card_ids", []):
                    continue
                try:
                    card = card_by_id(state, card_id)
                except ValueError:
                    continue
                node = _manual_action_node(card)
                if node and _preconditions_met(state, node, city=city, card_id=card_id, player=active):
                    actions.append({"type": "exhaust_card", "player_id": active["id"], "city_id": city["id"], "card_id": card_id})
    for card_id in active.get("hand", []):
        try:
            card = card_by_id(state, card_id)
        except ValueError:
            continue
        if not _card_requires_state_minister(card) or _active_ministry(state, active).get("data", {}).get("can_propose_politics_economy"):
            actions.append({"type": "propose_project", "player_id": active["id"], "card_id": card_id, "source": "hand"})
    for card_id in state.get("common_pool", []):
        try:
            card = card_by_id(state, card_id)
        except ValueError:
            continue
        if not _card_requires_state_minister(card) or _active_ministry(state, active).get("data", {}).get("can_propose_politics_economy"):
            actions.append({"type": "propose_project", "player_id": active["id"], "card_id": card_id, "source": "common_pool"})
    for project in state.get("projects", []):
        try:
            card = card_by_id(state, project.get("card_id", ""))
        except ValueError:
            continue
        if _project_complete(card, project) and _player_can_finalize_project(state, active):
            if _is_city_card(card) and _city_card_can_be_founded(state, card):
                actions.append({
                    "type": "build_project",
                    "player_id": active["id"],
                    "project_id": project["id"],
                    "card_id": card["id"],
                    "city_id": "__new_city__",
                })
            else:
                for city in state.get("cities", []):
                    if _card_can_be_built_in_city(state, card, city):
                        actions.append({
                            "type": "build_project",
                            "player_id": active["id"],
                            "project_id": project["id"],
                            "card_id": card["id"],
                            "city_id": city["id"],
                        })
        cost = card.get("data", {}).get("cost") or {}
        contributions = project.get("contributions") or {}
        for tag_id, required in cost.items():
            available = int(active.get("mana", {}).get(tag_id, 0))
            if available > 0 and int(contributions.get(tag_id, 0)) < int(required):
                actions.append({"type": "assign_mana", "player_id": active["id"], "project_id": project["id"], "tag_id": tag_id, "amount": 1})
    actions.append({"type": "pass", "player_id": active["id"]})
    return actions


def _start_player_turn(player: dict[str, Any]) -> None:
    player["turn_exhaust_used"] = False


def _require_phase(state: dict[str, Any], phase: str) -> None:
    if (state.get("phase") or "administration") != phase:
        raise ValueError(f"Action is only available during the {phase} phase.")


def _reveal_event(state: dict[str, Any]) -> None:
    event_deck = state.setdefault("event_deck", [])
    if not event_deck:
        state.setdefault("log", []).append("Event phase began. Event deck is empty.")
        return
    event_id = event_deck.pop(0)
    queue = state.setdefault("event_queue", [])
    if len(queue) >= EVENT_QUEUE_LIMIT:
        queue.pop(0)
    queue.append(event_id)
    try:
        event = event_by_id(state, event_id)
        state.setdefault("log", []).append(f"Event revealed: {event['name']}.")
    except ValueError:
        state.setdefault("log", []).append(f"Event revealed: {event_id}.")


def _decay_phase(state: dict[str, Any]) -> None:
    remaining_projects = []
    for project in state.get("projects", []):
        try:
            card = card_by_id(state, project.get("card_id", ""))
        except ValueError:
            continue
        if _project_complete(card, project):
            remaining_projects.append(project)
        else:
            project["contributions"] = {}
            remaining_projects.append(project)
    state["projects"] = remaining_projects
    for city_entry in state.get("cities", []):
        city_entry["exhausted_card_ids"] = []
    for player in state.get("players", []):
        player["mana"] = {}
        player["once_per_year_used"] = []
        player["peeked_event_ids"] = []
    state["phase"] = "crisis"
    state["year_phase"] = "crisis"


def _project_complete(card: dict[str, Any], project: dict[str, Any]) -> bool:
    cost = card.get("data", {}).get("cost") or {}
    if not cost:
        return True
    contributions = project.get("contributions") or {}
    return all(int(contributions.get(tag_id, 0)) >= int(amount) for tag_id, amount in cost.items())


def _select_ministries(
    players: list[dict[str, Any]],
    ministries: list[dict[str, Any]],
    *,
    minister_of_empire_player_id: str,
) -> dict[str, str]:
    selected: dict[str, str] = {}
    non_empire_ministries = [
        ministry
        for ministry in ministries
        if not (ministry.get("data", {}) or {}).get("is_minister_of_empire")
    ]
    for index, player in enumerate(players):
        player_id = str(player.get("id") or "")
        if player_id == minister_of_empire_player_id:
            selected[player_id] = "minister-of-the-empire"
        elif non_empire_ministries:
            selected[player_id] = str(non_empire_ministries[(index - 1) % len(non_empire_ministries)].get("id") or "")
    return selected


def _rotate_minister_of_empire(state: dict[str, Any]) -> None:
    players = state.get("players", [])
    if not players:
        return
    current_id = state.get("minister_of_empire_player_id") or players[0].get("id")
    current_index = next((index for index, player in enumerate(players) if player.get("id") == current_id), 0)
    next_player = players[(current_index + 1) % len(players)]
    state["minister_of_empire_player_id"] = next_player.get("id", "")
    state["active_player_id"] = next_player.get("id", "")
    state.setdefault("log", []).append(f"{next_player.get('name', 'Next player')} is Minister of the Empire.")


def _select_year_ministries(state: dict[str, Any]) -> None:
    state["blocked_player_id"] = ""
    state["selected_ministries"] = _select_ministries(
        state.get("players", []),
        state.get("catalog", {}).get("ministries", []),
        minister_of_empire_player_id=str(state.get("minister_of_empire_player_id") or ""),
    )


def _draw_for_all_players(state: dict[str, Any], amount: int) -> None:
    deck = Deck(state.get("draw_deck", []))
    for player in state.get("players", []):
        player.setdefault("hand", []).extend(deck.draw(amount))
    state["draw_deck"] = deck.to_list()


def _card_can_be_built_in_city(state: dict[str, Any], card: dict[str, Any], city: dict[str, Any]) -> bool:
    if _is_city_card(card):
        return False
    placement = str((card.get("data", {}) or {}).get("placement") or "city")
    if placement not in {"", "city", "local"}:
        return False
    if _city_building_slots_available(state, city) <= 0:
        return False
    for tag_id, amount in ((card.get("data", {}) or {}).get("required_city_tags") or {}).items():
        if _count_city_token(state, city, tag_id) < int(amount):
            return False
    return all(_build_requirement_met(state, requirement, city) for requirement in (card.get("data", {}).get("requirements") or []))


def _city_card_can_be_founded(state: dict[str, Any], card: dict[str, Any]) -> bool:
    data = card.get("data", {}) or {}
    for tag_id, amount in (data.get("required_city_tags") or {}).items():
        if _count_global_token(state, tag_id) < int(amount):
            return False
    return all(_city_requirement_met(state, requirement) for requirement in (data.get("requirements") or []))


def _city_requirement_met(state: dict[str, Any], requirement: dict[str, Any]) -> bool:
    requirement_type = requirement.get("type")
    if requirement_type == "not_condition":
        tag_id = str(requirement.get("tag_id") or "")
        return bool(tag_id) and _count_global_token(state, tag_id) <= 0
    if requirement_type == "has_card":
        card_id = str(requirement.get("card_id") or "")
        return bool(card_id) and any(_city_has_card(entry, card_id) for entry in state.get("cities", []))
    return False


def _card_requires_state_minister(card: dict[str, Any]) -> bool:
    return str((card.get("data", {}) or {}).get("card_type") or card.get("category") or "").casefold() in {"politics", "economy", "political", "economic"}


def _player_can_finalize_project(state: dict[str, Any], player: dict[str, Any]) -> bool:
    ministries = state.get("catalog", {}).get("ministries") or []
    if not ministries:
        return True
    if player.get("id") == state.get("minister_of_empire_player_id"):
        return True
    return bool(_active_ministry(state, player).get("data", {}).get("can_finalize_projects"))


def _active_ministry(state: dict[str, Any], player: dict[str, Any]) -> dict[str, Any]:
    ministry_id = (state.get("selected_ministries") or {}).get(player.get("id"))
    for ministry in state.get("catalog", {}).get("ministries", []):
        if ministry.get("id") == ministry_id:
            return ministry
    return {}


def _ministry_infrastructure_resources(ministry: dict[str, Any]) -> dict[str, int]:
    raw_resources = (ministry.get("data", {}) or {}).get("infrastructure_resources") or []
    if isinstance(raw_resources, list):
        return {str(tag_id): 1 for tag_id in raw_resources if str(tag_id or "").strip()}
    if isinstance(raw_resources, dict):
        return {
            str(tag_id): int(amount)
            for tag_id, amount in raw_resources.items()
            if str(tag_id or "").strip() and int(amount) > 0
        }
    return {}


def _build_requirement_met(state: dict[str, Any], requirement: dict[str, Any], city: dict[str, Any]) -> bool:
    requirement_type = requirement.get("type")
    if requirement_type == "not_condition":
        tag_id = str(requirement.get("tag_id") or "")
        return bool(tag_id) and _count_city_token(state, city, tag_id) <= 0
    if requirement_type == "has_card":
        card_id = str(requirement.get("card_id") or "")
        scope = str(requirement.get("scope") or "city")
        if not card_id:
            return False
        if scope in {"global", "empire"}:
            return any(_city_has_card(entry, card_id) for entry in state.get("cities", []))
        return _city_has_card(city, card_id)
    return False


def _city_has_card(city: dict[str, Any], card_id: str) -> bool:
    return card_id in _city_card_ids(city)


def _city_card_ids(city: dict[str, Any]) -> list[str]:
    card_ids: list[str] = []
    for card_id in [city.get("city_card_id"), city.get("foundation_card_id"), *(city.get("cards") or [])]:
        if card_id and card_id not in card_ids:
            card_ids.append(card_id)
    return card_ids


def _is_city_card(card: dict[str, Any]) -> bool:
    data = card.get("data", {}) or {}
    return str(data.get("card_type") or card.get("category") or "").casefold() in {"city", "settlement"}


def _city_building_slots(state: dict[str, Any], city: dict[str, Any]) -> int | None:
    if "building_slots" in city:
        return max(0, int(city.get("building_slots") or 0))
    city_card_id = city.get("city_card_id") or city.get("foundation_card_id")
    if not city_card_id:
        return None
    try:
        card = card_by_id(state, city_card_id)
    except ValueError:
        return None
    data = card.get("data", {}) or {}
    if "building_slots" not in data:
        return None
    return max(0, int(data.get("building_slots") or 0))


def _city_building_slots_available(state: dict[str, Any], city: dict[str, Any]) -> int:
    slots = _city_building_slots(state, city)
    if slots is None:
        return 9999
    return slots - len(city.get("cards") or [])


def _create_city_from_card(state: dict[str, Any], card: dict[str, Any]) -> dict[str, Any]:
    city_id = f"city-{uuid.uuid4().hex[:8]}"
    data = card.get("data", {}) or {}
    city = {
        "id": city_id,
        "name": card.get("name") or "City",
        "city_card_id": card["id"],
        "building_slots": max(0, int(data.get("building_slots") or 0)),
        "cards": [],
        "exhausted_card_ids": [],
    }
    state.setdefault("cities", []).append(city)
    return city


def _manual_action_node(card: dict[str, Any]) -> dict[str, Any] | None:
    for node in card.get("data", {}).get("logic_nodes") or []:
        if node.get("trigger") in {"manual", "manual_action"}:
            return node
    return None


def _node_requires_exhaust(node: dict[str, Any]) -> bool:
    preconditions = node.get("preconditions") or {}
    return bool(preconditions.get("exhaust"))


def _preconditions_met(
    state: dict[str, Any],
    node: dict[str, Any],
    *,
    city: dict[str, Any],
    card_id: str,
    player: dict[str, Any],
) -> bool:
    preconditions = node.get("preconditions") or {}
    for tag_id, required in _tag_counts(preconditions.get("empire_tags") or preconditions.get("required_empire_tags")).items():
        if _count_global_token(state, tag_id) < required:
            return False
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
        elif effect_type == "add_resources":
            for tag_id, amount in _tag_counts(payload.get("resources") or payload.get("mana")).items():
                player.setdefault("mana", {})[tag_id] = int(player.get("mana", {}).get(tag_id, 0)) + amount
        elif effect_type == "modify_token":
            _modify_token(state, payload, city=city, card_id=card_id)
        elif effect_type == "draw_card":
            amount = max(1, int(payload.get("amount") or 1))
            deck = Deck(state.get("draw_deck", []))
            player.setdefault("hand", []).extend(deck.draw(amount))
            state["draw_deck"] = deck.to_list()
        elif effect_type == "ready_building":
            city["exhausted_card_ids"] = [entry for entry in city.get("exhausted_card_ids", []) if entry != card_id]


def _tag_counts(value: Any) -> dict[str, int]:
    if isinstance(value, dict):
        return {
            str(tag_id): int(amount)
            for tag_id, amount in value.items()
            if str(tag_id or "").strip() and int(amount) > 0
        }
    if isinstance(value, list):
        counts: dict[str, int] = {}
        for tag_id in value:
            normalized = str(tag_id or "").strip()
            if normalized:
                counts[normalized] = counts.get(normalized, 0) + 1
        return counts
    return {}


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
    for card_id in _city_card_ids(city):
        if not card_id:
            continue
        try:
            card = card_by_id(state, card_id)
        except ValueError:
            continue
        data = card.get("data", {})
        total += int((data.get("tokens") or {}).get(token, 0))
        tags = data.get("tags") or {}
        if isinstance(tags, dict):
            total += int(tags.get(token, 0))
        elif token in tags:
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
