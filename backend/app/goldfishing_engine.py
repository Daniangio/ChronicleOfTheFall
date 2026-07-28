from __future__ import annotations

import random
import uuid
from collections import Counter
from copy import deepcopy
from typing import Any


PLAYER_COUNT = 4
BASE_HAND_SIZE = 3
EMPIRE_HAND_SIZE = 1
HAND_TARGET = 4
STATE_HAND_TARGET = 5
SCHEME_SLOTS = 1
STALLED_VOTE_THRESHOLD = 2
MINISTRY_ROTATION_ORDER = ("cities", "state", "war", "health")

PHASES = (
    "suspicion",
    "production",
    "queued_projects",
    "plotting",
    "docket_ordering",
    "reveal",
    "stalled_vote",
    "crisis",
    "condition",
    "storage",
    "cleanup",
    "game_over",
)


class Deck:
    def __init__(self, card_ids: list[str], *, discard_ids: list[str] | None = None) -> None:
        self._card_ids = list(card_ids)
        self._discard_ids = list(discard_ids or [])

    def shuffle(self, seed: str) -> None:
        random.Random(seed).shuffle(self._card_ids)

    def draw(self, amount: int = 1, *, seed: str = "") -> list[str]:
        drawn: list[str] = []
        while len(drawn) < amount:
            if not self._card_ids:
                if not self._discard_ids:
                    break
                self._card_ids = self._discard_ids
                self._discard_ids = []
                self.shuffle(f"{seed}:{len(drawn)}")
            drawn.append(self._card_ids.pop(0))
        return drawn

    def discard(self, card_id: str) -> None:
        if card_id:
            self._discard_ids.append(card_id)

    def to_list(self) -> list[str]:
        return list(self._card_ids)

    def discard_list(self) -> list[str]:
        return list(self._discard_ids)


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
    deck_ids: list[str],
    setup_pool_ids: list[str],
    deck_id: str,
    initial_city_card_id: str = "capital-foundation",
    level_id: str = "",
    event_entries: list[dict[str, Any]] | None = None,
    agenda_entries: list[dict[str, Any]] | None = None,
    ministry_entries: list[dict[str, Any]] | None = None,
    pillar_entries: list[dict[str, Any]] | None = None,
    token_entries: list[dict[str, Any]] | None = None,
    effect_icon_entries: list[dict[str, Any]] | None = None,
    image_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    card_entries = deepcopy(card_entries)
    tag_entries = deepcopy(tag_entries)
    events = deepcopy(event_entries or [])
    agendas = deepcopy(agenda_entries or [])
    ministries = deepcopy(ministry_entries or [])
    pillars = deepcopy(pillar_entries or [])
    tokens = deepcopy(token_entries or [])
    effect_icons = deepcopy(effect_icon_entries or [])
    images = deepcopy(image_entries or [])
    item_ids = {entry["id"] for entry in [*card_entries, *events]}
    card_lookup = {entry["id"]: entry for entry in card_entries}
    if initial_city_card_id not in card_lookup:
        city = next((entry for entry in card_entries if _is_city_card(entry)), None)
        initial_city_card_id = city["id"] if city else ""
    initial_city = card_lookup.get(initial_city_card_id, {})

    valid_deck_ids = [item_id for item_id in deck_ids if item_id in item_ids and item_id != initial_city_card_id]
    setup_counts = Counter(
        item_id for item_id in setup_pool_ids if item_id in item_ids and item_id != initial_city_card_id
    )
    remaining_setup = Counter(setup_counts)
    empire_ids: list[str] = []
    for item_id in valid_deck_ids:
        if remaining_setup[item_id] > 0:
            remaining_setup[item_id] -= 1
        else:
            empire_ids.append(item_id)
    if any(remaining_setup.values()):
        raise ValueError("Initial setup contains copies that are not present in the selected deck.")
    empire_deck = Deck(empire_ids)
    base_deck = Deck(list(setup_counts.elements()))
    empire_deck.shuffle(f"{room_id}:empire")
    base_deck.shuffle(f"{room_id}:base")

    players: list[dict[str, Any]] = []
    agenda_deck = Deck([entry["id"] for entry in agendas])
    agenda_deck.shuffle(f"{room_id}:agendas")
    for index in range(PLAYER_COUNT):
        base_cards = base_deck.draw(BASE_HAND_SIZE, seed=f"{room_id}:base:{index}")
        empire_cards = empire_deck.draw(EMPIRE_HAND_SIZE, seed=f"{room_id}:empire:{index}")
        if len(base_cards) < BASE_HAND_SIZE:
            empire_cards.extend(
                empire_deck.draw(BASE_HAND_SIZE - len(base_cards), seed=f"{room_id}:base-fallback:{index}")
            )
        players.append(
            {
                "id": f"player-{index + 1}",
                "name": f"Player {index + 1}",
                "hand": [*base_cards, *empire_cards],
                "scheme_slots": [None] * SCHEME_SLOTS,
                "ministry_ids": [],
                "suspicion": 0,
                "committed": False,
                "plotting_scheme_used": False,
                "plotting_discards": 0,
                "hidden_agenda_id": (agenda_deck.draw(1) or [""])[0],
            }
        )

    pillar_values = {
        entry["id"]: int((entry.get("data") or {}).get("start", 5))
        for entry in pillars
    }
    if not pillar_values:
        pillar_values = {"treasury": 5, "stability": 5, "morale": 5}

    state: dict[str, Any] = {
        "mode": "goldfishing",
        "rules_version": "anonymous-council",
        "room_id": room_id,
        "era": 1,
        "epoch": 1,
        "phase": "suspicion",
        "active_player_id": "player-1",
        "minister_of_empire_player_id": "player-1",
        "players": players,
        "pillars": pillar_values,
        "global_resource_pool": {},
        "stored_resources": {},
        "frozen_resources": [],
        "blocked_players": [],
        "ministry_assignments": {},
        "suspicion_placements": {},
        "commitments": [],
        "council_stack": [],
        "current_reveal": None,
        "revealed_cards": [],
        "pending_placement": None,
        "pending_event_resource_effect": None,
        "pending_event_resource_conversion": None,
        "pending_event_city_tokens": None,
        "pending_event_draw_choice": None,
        "structure_tag_requirement_waivers": 0,
        "plague_morale_suppressed": False,
        "stalled_projects": [],
        "queued_projects": [],
        "votes": {},
        "current_crisis_id": "",
        "war_power_used": False,
        "cleanup_completed": [],
        "agendas_revealed": False,
        "winner_player_ids": [],
        "cities": [
            {
                "id": "capital",
                "name": initial_city.get("name") or "Capital",
                "city_card_id": initial_city_card_id,
                "building_slots": int((initial_city.get("data") or {}).get("building_slots") or 4),
                "cards": [],
                "condition_tokens": {},
            }
        ] if initial_city_card_id else [],
        "empire_deck": empire_deck.to_list(),
        "empire_discard": [],
        "base_deck": base_deck.to_list(),
        "crisis_deck": [],
        "crisis_discard": [],
        "catalog": {
            "cards": card_entries,
            "tags": tag_entries,
            "events": events,
            "ministries": ministries,
            "pillars": pillars,
            "tokens": tokens,
            "effect_icons": effect_icons,
            "images": images,
            "agendas": agendas,
        },
        "decks": {
            "empire": deck_id,
        },
        "level_id": level_id,
        "log": [
            f"Setup complete. {PLAYER_COUNT} players received {BASE_HAND_SIZE} Base cards and "
            f"{EMPIRE_HAND_SIZE} Empire cards."
        ],
    }
    _assign_ministries(state, rotate=False)
    return _prepare_state(state)


def perform_action(state: dict[str, Any], action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    next_state = deepcopy(state)
    data = payload or {}
    handlers = {
        "place_suspicion": _place_suspicion,
        "continue_phase": _continue_phase,
        "commit_card": _commit_card,
        "commit_none": _commit_none,
        "plotting_scheme": _plotting_scheme,
        "plotting_discard": _plotting_discard,
        "move_docket_card": _move_docket_card,
        "confirm_docket_order": _confirm_docket_order,
        "choose_event_resource": _choose_event_resource,
        "choose_event_conversion_resource": _choose_event_conversion_resource,
        "choose_event_token_city": _choose_event_token_city,
        "choose_event_draw": _choose_event_draw,
        "reveal_next": _reveal_next,
        "place_revealed_card": _place_revealed_card,
        "place_queued_project": _place_queued_project,
        "vote_stalled_project": _vote_stalled_project,
        "resolve_crisis": _resolve_crisis,
        "store_resources": _store_resources,
        "cleanup_draw": _cleanup_draw,
    }
    handler = handlers.get(action)
    if not handler:
        raise ValueError("Unknown game action.")
    handler(next_state, data)
    return _prepare_state(next_state)


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


def item_by_id(state: dict[str, Any], item_id: str) -> dict[str, Any]:
    try:
        return card_by_id(state, item_id)
    except ValueError:
        return event_by_id(state, item_id)


def _place_suspicion(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "suspicion")
    player_id = _require_active_player(state, payload)
    target_id = str(payload.get("target_player_id") or "")
    if target_id == state.get("minister_of_empire_player_id"):
        raise ValueError("The Minister of the Empire cannot receive Suspicion.")
    if target_id == player_id:
        raise ValueError("A player cannot place Suspicion on themselves.")
    if target_id and target_id not in {player["id"] for player in state["players"]}:
        raise ValueError("Suspicion target not found.")
    if player_id in state["suspicion_placements"]:
        raise ValueError("This player already placed Suspicion.")
    state["suspicion_placements"][player_id] = target_id or None
    if target_id:
        target = _player(state, target_id)
        target["suspicion"] = int(target.get("suspicion", 0)) + 1
        state["log"].append(f"{_player(state, player_id)['name']} placed Suspicion on {target['name']}.")
    else:
        state["log"].append(f"{_player(state, player_id)['name']} placed no Suspicion.")
    _advance_ordered_player(state, completed_ids=set(state["suspicion_placements"]))
    if len(state["suspicion_placements"]) == len(state["players"]):
        state["phase"] = "production"
        state["active_player_id"] = state["minister_of_empire_player_id"]
        state["log"].append("Production Phase began.")


def _continue_phase(state: dict[str, Any], _payload: dict[str, Any]) -> None:
    phase = state.get("phase")
    if phase == "production":
        _run_production(state)
        state["phase"] = "queued_projects"
        state["log"].append("Queued Project Resolution began.")
    elif phase == "queued_projects":
        if state.get("pending_placement"):
            raise ValueError("A queued project still needs placement.")
        _process_queued_projects(state)
    elif phase == "reveal":
        if state.get("pending_placement"):
            raise ValueError("The revealed card still needs placement.")
        _reveal_next(state, {})
    elif phase == "crisis":
        if state.get("current_crisis_id"):
            raise ValueError("The current Crisis must be resolved.")
        _begin_condition(state)
    elif phase == "condition":
        _run_condition_phase(state)
    elif phase == "storage":
        state["stored_resources"] = {}
        state["global_resource_pool"] = {}
        _begin_cleanup(state)
    elif phase == "cleanup":
        raise ValueError("Cleanup decisions are still required.")
    else:
        raise ValueError("The current phase cannot be advanced.")


def _commit_card(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_active_player(state, payload)
    player = _player(state, player_id)
    source = str(payload.get("source") or "hand")
    index = int(payload.get("index", -1))
    cards = player["hand"] if source == "hand" else player["scheme_slots"] if source == "scheme" else None
    if cards is None or index < 0 or index >= len(cards) or not cards[index]:
        raise ValueError("Committed card is not available.")
    item_id = str(cards[index])
    item = item_by_id(state, item_id)
    if int(player.get("suspicion", 0)) >= 3 and _is_event(item):
        raise ValueError("A player with 3 or more Suspicion cannot commit an Event.")
    if source == "hand":
        cards.pop(index)
    else:
        cards[index] = None
    face_up = int(player.get("suspicion", 0)) >= 2
    state["commitments"].append(
        {
            "id": f"commitment-{uuid.uuid4().hex[:10]}",
            "item_id": item_id,
            "kind": "events" if _is_event(item) else "cards",
            "owner_player_id": player_id if face_up else "",
            "face_up": face_up,
        }
    )
    player["committed"] = True
    state["log"].append(
        f"{player['name']} committed {item.get('name', item_id) if face_up else 'a face-down card'}."
    )
    _advance_plotting(state)


def _commit_none(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_active_player(state, payload)
    if _legal_commit_options(state, _player(state, player_id)):
        raise ValueError("This player has a legal card to commit.")
    _player(state, player_id)["committed"] = True
    state["log"].append(f"{_player(state, player_id)['name']} could not commit a card.")
    _advance_plotting(state)


def _plotting_scheme(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_active_player(state, payload)
    player = _player(state, player_id)
    if player.get("plotting_scheme_used"):
        raise ValueError("This player already managed their Scheme Slot this turn.")
    hand_index = int(payload.get("hand_index", -1))
    if hand_index < 0 or hand_index >= len(player["hand"]):
        raise ValueError("Hand card not found.")
    hand_card = player["hand"].pop(hand_index)
    slot_card = player["scheme_slots"][0]
    player["scheme_slots"][0] = hand_card
    if slot_card:
        player["hand"].append(slot_card)
    player["plotting_scheme_used"] = True
    state["log"].append(
        f"{player['name']} {'swapped a card with' if slot_card else 'placed a card in'} their Scheme Slot."
    )


def _plotting_discard(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_active_player(state, payload)
    player = _player(state, player_id)
    discard_limit = 2 if _player_has_ministry(state, player_id, "war") else 1
    if int(player.get("plotting_discards", 0)) >= discard_limit:
        raise ValueError("This player cannot discard another card this turn.")
    source = str(payload.get("source") or "hand")
    index = int(payload.get("index", -1))
    cards = player["hand"] if source == "hand" else player["scheme_slots"] if source == "scheme" else None
    if cards is None or index < 0 or index >= len(cards) or not cards[index]:
        raise ValueError("Discarded card is not available.")
    item_id = str(cards[index])
    if _is_crisis(item_by_id(state, item_id)):
        raise ValueError("Crisis cards cannot be discarded during Plotting.")
    if source == "hand":
        cards.pop(index)
    else:
        cards[index] = None
    _discard_empire_item(state, item_id)
    player["plotting_discards"] = int(player.get("plotting_discards", 0)) + 1
    state["log"].append(f"{player['name']} discarded a card during Plotting.")


def _move_docket_card(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "docket_ordering")
    _require_active_player(state, payload)
    commitment_id = str(payload.get("commitment_id") or "")
    direction = int(payload.get("direction") or 0)
    if direction not in {-1, 1}:
        raise ValueError("Docket cards can only move one position at a time.")
    docket = state.get("council_stack", [])
    index = next((position for position, entry in enumerate(docket) if entry["id"] == commitment_id), -1)
    destination = index + direction
    if index < 0:
        raise ValueError("Docket card not found.")
    if destination < 0 or destination >= len(docket):
        raise ValueError("Docket card is already at that edge.")
    docket[index], docket[destination] = docket[destination], docket[index]


def _confirm_docket_order(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "docket_ordering")
    _require_active_player(state, payload)
    state["phase"] = "reveal"
    state["current_reveal"] = None
    state["revealed_cards"] = []
    state["log"].append("The Minister of the Empire ordered the Council Docket.")


def _reveal_next(state: dict[str, Any], _payload: dict[str, Any]) -> None:
    _require_phase(state, "reveal")
    if state.get("pending_placement"):
        raise ValueError("The current card needs placement.")
    stack = state.get("council_stack", [])
    if not stack:
        _begin_stalled_vote_or_crisis(state)
        return
    commitment = stack.pop(0)
    item = item_by_id(state, commitment["item_id"])
    reveal = {
        **commitment,
        "name": item.get("name") or commitment["item_id"],
        "status": "revealed",
    }
    state["current_reveal"] = reveal
    state["revealed_cards"].append(reveal)
    state["log"].append(f"Council revealed {reveal['name']}.")
    if _is_event(item):
        data = item.get("data") or {}
        resolved = _event_requirements_met(state, data.get("requirements") or [])
        if resolved:
            _pay_event_resource_cost(state, data.get("requirements") or [])
        completed = _apply_event_effects(
            state,
            item,
            data.get("main_effects", []) if resolved else data.get("alternative_effects", []),
            continuation="reveal",
            requirements_met=resolved,
        )
        if completed:
            _complete_event_resolution(state, item, continuation="reveal", requirements_met=resolved)
        else:
            reveal["status"] = "awaiting_resource_choice"
        return
    _resolve_buildable_item(state, item, source="reveal", reference_id=commitment["id"])


def _place_revealed_card(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "reveal")
    pending = state.get("pending_placement")
    if not pending or pending.get("source") != "reveal":
        raise ValueError("No revealed card is waiting for placement.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    city_id = str(payload.get("city_id") or "")
    if city_id not in pending["legal_city_ids"]:
        raise ValueError("That placement is not legal.")
    item = card_by_id(state, pending["card_id"])
    _pay_cost(state, item)
    _build_card(state, item, city_id)
    state["current_reveal"]["status"] = "built"
    state["pending_placement"] = None


def _place_queued_project(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "queued_projects")
    pending = state.get("pending_placement")
    if not pending or pending.get("source") != "queued":
        raise ValueError("No queued project is waiting for placement.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    city_id = str(payload.get("city_id") or "")
    if city_id not in pending["legal_city_ids"]:
        raise ValueError("That placement is not legal.")
    item = card_by_id(state, pending["card_id"])
    _pay_cost(state, item)
    _build_card(state, item, city_id)
    state["queued_projects"] = [
        project for project in state["queued_projects"] if project["id"] != pending["reference_id"]
    ]
    state["pending_placement"] = None
    _process_queued_projects(state)


def _vote_stalled_project(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "stalled_vote")
    player_id = _require_active_player(state, payload)
    project_id = str(payload.get("project_id") or "")
    valid_ids = {project["id"] for project in state["stalled_projects"]}
    if project_id and project_id not in valid_ids:
        raise ValueError("Stalled project not found.")
    state["votes"][player_id] = project_id or None
    state["log"].append(
        f"{_player(state, player_id)['name']} voted for "
        f"{_project_name(state, project_id) if project_id else 'no project'}."
    )
    _advance_ordered_player(state, completed_ids=set(state["votes"]))
    if len(state["votes"]) < len(state["players"]):
        return
    vote_counts = Counter(project_id for project_id in state["votes"].values() if project_id)
    kept: list[dict[str, Any]] = []
    for project in state["stalled_projects"]:
        if vote_counts[project["id"]] >= STALLED_VOTE_THRESHOLD:
            kept.append(project)
        else:
            _discard_empire_item(state, project["card_id"])
    state["queued_projects"] = kept
    state["stalled_projects"] = []
    _begin_crisis(state)


def _resolve_crisis(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "crisis")
    crisis_id = str(state.get("current_crisis_id") or "")
    if not crisis_id:
        raise ValueError("There is no Crisis to resolve.")
    event = event_by_id(state, crisis_id)
    data = event.get("data") or {}
    resolved = _event_requirements_met(state, data.get("requirements") or [])
    if resolved:
        _pay_event_resource_cost(state, data.get("requirements") or [])
    completed = _apply_event_effects(
        state,
        event,
        data.get("main_effects", []) if resolved else data.get("alternative_effects", []),
        continuation="crisis",
        requirements_met=resolved,
    )
    if completed:
        _complete_event_resolution(state, event, continuation="crisis", requirements_met=resolved)


def _store_resources(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "storage")
    decision_player = _ministry_holder(state, "cities") or state["minister_of_empire_player_id"]
    _require_decision_player(state, payload, decision_player)
    requested = _counts(payload.get("resources"))
    pool = _counts(state.get("global_resource_pool"))
    if any(amount > int(pool.get(resource_id, 0)) for resource_id, amount in requested.items()):
        raise ValueError("Cannot store more resources than the Empire has.")
    generic_capacity, specific_capacity = _storage_capacity(state)
    generic_needed = sum(
        max(0, amount - int(specific_capacity.get(resource_id, 0)))
        for resource_id, amount in requested.items()
    )
    if generic_needed > generic_capacity:
        raise ValueError("Selected resources exceed Empire storage capacity.")
    state["stored_resources"] = requested
    state["global_resource_pool"] = {}
    state["log"].append(f"{_player(state, decision_player)['name']} stored {sum(requested.values())} resources.")
    _begin_cleanup(state)


def _cleanup_draw(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "cleanup")
    player_id = _require_active_player(state, payload)
    player = _player(state, player_id)
    hand_target = STATE_HAND_TARGET if _player_has_ministry(state, player_id, "state") else HAND_TARGET
    draw_amount = max(0, hand_target - len(player["hand"]))
    player["hand"].extend(_draw_empire(state, draw_amount))
    state["log"].append(f"{player['name']} drew to {hand_target} cards.")
    _complete_cleanup_player(state, player_id)


def _assign_ministries(state: dict[str, Any], *, rotate: bool) -> None:
    players = state["players"]
    current_index = _player_index(state, state.get("minister_of_empire_player_id"))
    if rotate:
        current_index = (current_index + 1) % len(players)
    blocked = set(state.pop("blocked_players_next_era", []))
    state["blocked_players"] = list(blocked)
    empire_player_id = players[current_index]["id"]
    state["blocked_players"] = [
        player_id for player_id in state["blocked_players"] if player_id != empire_player_id
    ]
    state["minister_of_empire_player_id"] = empire_player_id
    state["ministry_assignments"] = {}
    for player in players:
        player["ministry_ids"] = []
    empire_ministry = next(
        (entry for entry in state["catalog"]["ministries"] if _is_ministry(entry, "empire")),
        None,
    )
    if empire_ministry:
        state["ministry_assignments"][empire_ministry["id"]] = empire_player_id
        _player(state, empire_player_id)["ministry_ids"].append(empire_ministry["id"])

    ministries = [
        ministry
        for role in MINISTRY_ROTATION_ORDER
        for ministry in state["catalog"]["ministries"]
        if ministry is not empire_ministry and _is_ministry(ministry, role)
    ]
    era_offset = int(state.get("era", 1)) - 1
    for ministry_index, ministry in enumerate(ministries):
        holder = players[(ministry_index - era_offset) % len(players)]["id"]
        if holder in state["blocked_players"]:
            continue
        state["ministry_assignments"][ministry["id"]] = holder
        _player(state, holder)["ministry_ids"].append(ministry["id"])

    state["log"].append(
        f"Era {state['era']}: {_player(state, empire_player_id)['name']} is Minister of the Empire."
    )
    _begin_suspicion(state)


def _begin_suspicion(state: dict[str, Any]) -> None:
    state["phase"] = "suspicion"
    state["suspicion_placements"] = {}
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Suspicion Phase began.")


def _run_production(state: dict[str, Any]) -> None:
    production = Counter(_counts(state.get("stored_resources")))
    frozen = set(state.get("frozen_resources", []))
    for city in state.get("cities", []):
        for card_id in [city.get("city_card_id"), *city.get("cards", [])]:
            if not card_id:
                continue
            card = card_by_id(state, card_id)
            for resource_id, amount in _production_for_card(card).items():
                if resource_id not in frozen:
                    production[resource_id] += amount
    state["global_resource_pool"] = _positive_counts(production)
    state["stored_resources"] = {}
    state["frozen_resources"] = []
    state["log"].append(f"Production generated {sum(production.values())} resources.")


def _process_queued_projects(state: dict[str, Any]) -> None:
    while state.get("queued_projects") and not state.get("pending_placement"):
        project = state["queued_projects"][0]
        card = card_by_id(state, project["card_id"])
        placements = _legal_placements(state, card)
        if not _requirements_satisfied(state, card) or not _can_pay_cost(state, card) or not placements:
            state["queued_projects"].pop(0)
            state["stalled_projects"].append(project)
            state["log"].append(f"{card['name']} returned to the Stalled Row.")
            continue
        if len(placements) == 1:
            _pay_cost(state, card)
            _build_card(state, card, placements[0])
            state["queued_projects"].pop(0)
            continue
        state["pending_placement"] = _placement_payload(state, card, placements, "queued", project["id"])
    if not state.get("queued_projects") and not state.get("pending_placement"):
        _begin_plotting(state)


def _begin_plotting(state: dict[str, Any]) -> None:
    state["phase"] = "plotting"
    state["commitments"] = []
    state["council_stack"] = []
    for player in state["players"]:
        player["committed"] = False
        player["plotting_scheme_used"] = False
        player["plotting_discards"] = 0
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Plotting Phase began.")


def _advance_plotting(state: dict[str, Any]) -> None:
    committed = {player["id"] for player in state["players"] if player.get("committed")}
    if len(committed) < len(state["players"]):
        _advance_ordered_player(state, completed_ids=committed)
        return
    state["council_stack"] = list(state["commitments"])
    state["phase"] = "docket_ordering"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["current_reveal"] = None
    state["revealed_cards"] = []
    state["log"].append("The committed cards were revealed anonymously into the Council Docket.")


def _resolve_buildable_item(
    state: dict[str, Any],
    card: dict[str, Any],
    *,
    source: str,
    reference_id: str,
) -> None:
    placements = _legal_placements(state, card)
    if not _requirements_satisfied(state, card) or not _can_pay_cost(state, card) or not placements:
        project = {"id": f"stalled-{uuid.uuid4().hex[:10]}", "card_id": card["id"]}
        state["stalled_projects"].append(project)
        if state.get("current_reveal"):
            state["current_reveal"]["status"] = "stalled"
        state["log"].append(f"{card['name']} stalled.")
        return
    if len(placements) == 1:
        _pay_cost(state, card)
        _build_card(state, card, placements[0])
        if state.get("current_reveal"):
            state["current_reveal"]["status"] = "built"
        return
    state["pending_placement"] = _placement_payload(state, card, placements, source, reference_id)


def _begin_stalled_vote_or_crisis(state: dict[str, Any]) -> None:
    state["current_reveal"] = None
    if not state.get("stalled_projects"):
        _begin_crisis(state)
        return
    state["phase"] = "stalled_vote"
    state["votes"] = {}
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Stalled Project Vote began.")


def _begin_crisis(state: dict[str, Any]) -> None:
    state["phase"] = "crisis"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["current_crisis_id"] = ""
    if int(state.get("era", 1)) <= 1:
        state["log"].append("Era 1 has no Crisis.")
        return
    deck = Deck(state.get("crisis_deck", []), discard_ids=state.get("crisis_discard", []))
    drawn = deck.draw(1, seed=f"{state['room_id']}:{state['era']}:crisis")
    state["crisis_deck"] = deck.to_list()
    state["crisis_discard"] = deck.discard_list()
    if drawn:
        state["current_crisis_id"] = drawn[0]
        state["log"].append(f"Crisis revealed: {event_by_id(state, drawn[0])['name']}.")
    else:
        state["log"].append("The Crisis Deck is empty.")


def _begin_condition(state: dict[str, Any]) -> None:
    state["phase"] = "condition"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Condition Phase began.")


def _run_condition_phase(state: dict[str, Any]) -> None:
    if state.get("plague_morale_suppressed"):
        state["log"].append("Plague did not reduce Morale this Era.")
        _begin_storage(state)
        return
    morale_pillar_id = _pillar_id_by_name(state, "morale")
    for city in state.get("cities", []):
        plague = int(city.get("condition_tokens", {}).get("plague-token", 0))
        sanitary = int(_city_tag_counts(state, city).get("sanitary", 0))
        if plague > sanitary:
            _modify_pillar(state, morale_pillar_id, -1)
            state["log"].append(
                f"{city.get('name', 'A City')} lost 1 Morale because Plague exceeded Sanitary."
            )
    _begin_storage(state)


def _begin_storage(state: dict[str, Any]) -> None:
    state["phase"] = "storage"
    state["active_player_id"] = _ministry_holder(state, "cities") or state["minister_of_empire_player_id"]
    state["log"].append("Storage Phase began.")


def _begin_cleanup(state: dict[str, Any]) -> None:
    state["phase"] = "cleanup"
    state["cleanup_completed"] = []
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Cleanup began.")


def _complete_cleanup_player(state: dict[str, Any], player_id: str) -> None:
    state["cleanup_completed"].append(player_id)
    if len(state["cleanup_completed"]) == len(state["players"]):
        _end_era(state)
        return
    _advance_ordered_player(state, completed_ids=set(state["cleanup_completed"]))


def _end_era(state: dict[str, Any]) -> None:
    for player in state["players"]:
        player["suspicion"] = 0
        player["committed"] = False
    state["era"] = int(state.get("era", 1)) + 1
    state["epoch"] = state["era"]
    state["war_power_used"] = False
    state["structure_tag_requirement_waivers"] = 0
    state["plague_morale_suppressed"] = False
    state["suspicion_placements"] = {}
    state["votes"] = {}
    _assign_ministries(state, rotate=True)


def _possible_actions(state: dict[str, Any]) -> list[dict[str, Any]]:
    phase = state.get("phase")
    active = state.get("active_player_id")
    if phase == "game_over":
        return []
    if phase == "suspicion":
        protected_player_id = state.get("minister_of_empire_player_id")
        return [
            {"type": "place_suspicion", "player_id": active, "target_player_id": target}
            for target in [
                "",
                *[
                    player["id"]
                    for player in state["players"]
                    if player["id"] not in {active, protected_player_id}
                ],
            ]
        ]
    if phase == "production":
        return [{"type": "continue_phase"}]
    if phase == "queued_projects":
        pending = state.get("pending_placement")
        if pending:
            return [
                {
                    "type": "place_queued_project",
                    "player_id": pending["decision_player_id"],
                    "project_id": pending["reference_id"],
                    "card_id": pending["card_id"],
                    "city_id": city_id,
                }
                for city_id in pending["legal_city_ids"]
            ]
        return [{"type": "continue_phase"}]
    if phase == "plotting":
        player = _player(state, active)
        commit_actions = [
            {
                "type": "commit_card",
                "player_id": active,
                "item_id": item_id,
                "source": source,
                "index": index,
                "face_up": int(player.get("suspicion", 0)) >= 2,
            }
            for source, index, item_id in _legal_commit_options(state, player)
        ]
        scheme_actions = []
        if not player.get("plotting_scheme_used"):
            scheme_actions = [
                {
                    "type": "plotting_scheme",
                    "player_id": active,
                    "hand_index": index,
                    "mode": "swap" if player["scheme_slots"][0] else "place",
                }
                for index, item_id in enumerate(player["hand"])
                if item_id
            ]
        discard_limit = 2 if _player_has_ministry(state, active, "war") else 1
        discard_actions = []
        if int(player.get("plotting_discards", 0)) < discard_limit:
            discard_actions = [
                {
                    "type": "plotting_discard",
                    "player_id": active,
                    "source": source,
                    "index": index,
                    "item_id": item_id,
                }
                for source, cards in (("hand", player["hand"]), ("scheme", player["scheme_slots"]))
                for index, item_id in enumerate(cards)
                if item_id and not _is_crisis(item_by_id(state, item_id))
            ]
        mandatory_action = commit_actions or [{"type": "commit_none", "player_id": active}]
        return [*mandatory_action, *scheme_actions, *discard_actions]
    if phase == "docket_ordering":
        docket = state.get("council_stack", [])
        actions = [
            {
                "type": "move_docket_card",
                "player_id": active,
                "commitment_id": commitment["id"],
                "direction": direction,
            }
            for index, commitment in enumerate(docket)
            for direction in (-1, 1)
            if 0 <= index + direction < len(docket)
        ]
        return [*actions, {"type": "confirm_docket_order", "player_id": active}]
    if phase == "reveal":
        pending_draw = state.get("pending_event_draw_choice")
        if pending_draw:
            return [
                {
                    "type": "choose_event_draw",
                    "player_id": pending_draw["decision_player_id"],
                    "draw_index": index,
                    "item_id": item_id,
                }
                for index, item_id in enumerate(pending_draw["drawn_ids"])
            ]
        pending_city_tokens = state.get("pending_event_city_tokens")
        if pending_city_tokens:
            return [
                {
                    "type": "choose_event_token_city",
                    "player_id": pending_city_tokens["decision_player_id"],
                    "city_id": city["id"],
                }
                for city in state.get("cities", [])
            ]
        pending_conversion = state.get("pending_event_resource_conversion")
        if pending_conversion:
            return [
                {
                    "type": "choose_event_conversion_resource",
                    "player_id": pending_conversion["decision_player_id"],
                    "resource_id": resource_id,
                    "stage": pending_conversion["stage"],
                    "amount": pending_conversion["amount"],
                }
                for resource_id in pending_conversion["resource_ids"]
            ]
        pending_resource = state.get("pending_event_resource_effect")
        if pending_resource:
            return [
                {
                    "type": "choose_event_resource",
                    "player_id": pending_resource["decision_player_id"],
                    "resource_id": resource_id,
                    "amount": pending_resource["amount"],
                }
                for resource_id in pending_resource["resource_ids"]
            ]
        pending = state.get("pending_placement")
        if pending:
            return [
                {
                    "type": "place_revealed_card",
                    "player_id": pending["decision_player_id"],
                    "card_id": pending["card_id"],
                    "city_id": city_id,
                }
                for city_id in pending["legal_city_ids"]
            ]
        return [{"type": "reveal_next"}]
    if phase == "stalled_vote":
        return [
            {"type": "vote_stalled_project", "player_id": active, "project_id": project_id}
            for project_id in ["", *[project["id"] for project in state["stalled_projects"]]]
        ]
    if phase == "crisis":
        pending_draw = state.get("pending_event_draw_choice")
        if pending_draw:
            return [
                {
                    "type": "choose_event_draw",
                    "player_id": pending_draw["decision_player_id"],
                    "draw_index": index,
                    "item_id": item_id,
                }
                for index, item_id in enumerate(pending_draw["drawn_ids"])
            ]
        pending_city_tokens = state.get("pending_event_city_tokens")
        if pending_city_tokens:
            return [
                {
                    "type": "choose_event_token_city",
                    "player_id": pending_city_tokens["decision_player_id"],
                    "city_id": city["id"],
                }
                for city in state.get("cities", [])
            ]
        pending_conversion = state.get("pending_event_resource_conversion")
        if pending_conversion:
            return [
                {
                    "type": "choose_event_conversion_resource",
                    "player_id": pending_conversion["decision_player_id"],
                    "resource_id": resource_id,
                    "stage": pending_conversion["stage"],
                    "amount": pending_conversion["amount"],
                }
                for resource_id in pending_conversion["resource_ids"]
            ]
        pending_resource = state.get("pending_event_resource_effect")
        if pending_resource:
            return [
                {
                    "type": "choose_event_resource",
                    "player_id": pending_resource["decision_player_id"],
                    "resource_id": resource_id,
                    "amount": pending_resource["amount"],
                }
                for resource_id in pending_resource["resource_ids"]
            ]
        if not state.get("current_crisis_id"):
            return [{"type": "continue_phase"}]
        actions = [{"type": "resolve_crisis", "use_war_power": False}]
        if _ministry_holder(state, "war") and not state.get("war_power_used"):
            actions.append({"type": "resolve_crisis", "use_war_power": True})
        return actions
    if phase == "condition":
        return [{"type": "continue_phase"}]
    if phase == "storage":
        generic, specific = _storage_capacity(state)
        if not state.get("global_resource_pool") or generic + sum(specific.values()) <= 0:
            return [{"type": "continue_phase"}]
        return [
            {
                "type": "store_resources",
                "player_id": _ministry_holder(state, "cities") or state["minister_of_empire_player_id"],
                "generic_capacity": generic,
                "specific_capacity": specific,
            }
        ]
    if phase == "cleanup":
        target = STATE_HAND_TARGET if _player_has_ministry(state, active, "state") else HAND_TARGET
        return [{"type": "cleanup_draw", "player_id": active, "hand_target": target}]
    return []


def _prepare_state(state: dict[str, Any]) -> dict[str, Any]:
    state["empire_tags"] = _empire_tag_counts(state)
    generic, specific = _storage_capacity(state)
    state["storage_capacity"] = {"generic": generic, "specific": specific}
    if state.get("phase") != "game_over" and any(int(value) <= 0 for value in state.get("pillars", {}).values()):
        state["phase"] = "game_over"
        state["active_player_id"] = ""
        state["agendas_revealed"] = True
        state["winner_player_ids"] = [
            player["id"] for player in state.get("players", [])
            if _agenda_satisfied(state, player.get("hidden_agenda_id", ""))
        ]
        state["log"].append("The Empire collapsed.")
    state["possible_actions"] = _possible_actions(state)
    return state


def _legal_commit_options(state: dict[str, Any], player: dict[str, Any]) -> list[tuple[str, int, str]]:
    options = [
        ("hand", index, item_id)
        for index, item_id in enumerate(player.get("hand", []))
        if item_id
    ]
    options.extend(
        ("scheme", index, item_id)
        for index, item_id in enumerate(player.get("scheme_slots", []))
        if item_id
    )
    if int(player.get("suspicion", 0)) >= 3:
        options = [
            option for option in options
            if not _is_event(item_by_id(state, option[2]))
        ]
    return options


def _requirements_satisfied(state: dict[str, Any], card: dict[str, Any]) -> bool:
    data = card.get("data") or {}
    global_tags = _empire_tag_counts(state)
    if _is_city_card(card):
        for tag_id, amount in _counts(data.get("required_tags")).items():
            if int(global_tags.get(tag_id, 0)) < amount:
                return False
    return True


def _legal_placements(state: dict[str, Any], card: dict[str, Any]) -> list[str]:
    if not _requirements_satisfied(state, card):
        return []
    if _is_city_card(card):
        return ["__new_city__"]
    required = _counts((card.get("data") or {}).get("required_tags"))
    placements = []
    for city in state.get("cities", []):
        if len(city.get("cards", [])) >= int(city.get("building_slots", 0)):
            continue
        city_tags = _city_tag_counts(state, city)
        missing_tags = sum(
            max(0, amount - int(city_tags.get(tag_id, 0)))
            for tag_id, amount in required.items()
        )
        waiver_available = int(state.get("structure_tag_requirement_waivers", 0)) > 0
        if missing_tags == 0 or (waiver_available and missing_tags == 1):
            placements.append(city["id"])
    return placements


def _build_card(state: dict[str, Any], card: dict[str, Any], city_id: str) -> None:
    if _is_city_card(card):
        city = {
            "id": f"city-{uuid.uuid4().hex[:8]}",
            "name": card.get("name") or "City",
            "city_card_id": card["id"],
            "building_slots": int((card.get("data") or {}).get("building_slots") or 0),
            "cards": [],
            "condition_tokens": {},
        }
        state["cities"].append(city)
        state["log"].append(f"{card['name']} entered the Empire as a new City.")
    else:
        city = next((entry for entry in state["cities"] if entry["id"] == city_id), None)
        if not city:
            raise ValueError("City not found.")
        city["cards"].append(card["id"])
        state["log"].append(f"{card['name']} was built in {city['name']}.")
        if int(state.get("structure_tag_requirement_waivers", 0)) > 0:
            state["structure_tag_requirement_waivers"] -= 1
            state["log"].append("The Structure consumed a temporary tag-requirement waiver.")
    for effect in (card.get("data") or {}).get("persistent_effects", []):
        if effect.get("effect_type") == "add_building_slots":
            city["building_slots"] = int(city.get("building_slots", 0)) + max(
                0, int((effect.get("payload") or {}).get("amount", 0))
            )
    _apply_on_build_effects(state, card, city)


def _placement_payload(
    state: dict[str, Any],
    card: dict[str, Any],
    placements: list[str],
    source: str,
    reference_id: str,
) -> dict[str, Any]:
    decision_player = _ministry_holder(state, "cities") or state["minister_of_empire_player_id"]
    state["active_player_id"] = decision_player
    return {
        "source": source,
        "reference_id": reference_id,
        "card_id": card["id"],
        "legal_city_ids": placements,
        "decision_player_id": decision_player,
    }


def _can_pay_cost(state: dict[str, Any], card: dict[str, Any]) -> bool:
    pool = _counts(state.get("global_resource_pool"))
    return all(int(pool.get(resource_id, 0)) >= amount for resource_id, amount in _counts((card.get("data") or {}).get("cost")).items())


def _pay_cost(state: dict[str, Any], card: dict[str, Any]) -> None:
    if not _can_pay_cost(state, card):
        raise ValueError("The Empire cannot pay this card's full cost.")
    pool = Counter(_counts(state.get("global_resource_pool")))
    for resource_id, amount in _counts((card.get("data") or {}).get("cost")).items():
        pool[resource_id] -= amount
    state["global_resource_pool"] = _positive_counts(pool)


def _apply_on_build_effects(state: dict[str, Any], card: dict[str, Any], city: dict[str, Any]) -> None:
    for effect in (card.get("data") or {}).get("on_build_effects", []):
        payload = effect.get("payload") or {}
        if effect.get("effect_type") == "modify_pillar":
            pillar_id = str(payload.get("pillar_id") or "")
            if pillar_id:
                _modify_pillar(state, pillar_id, int(payload.get("amount", 0)))
        elif effect.get("effect_type") == "modify_token":
            token_id = str(payload.get("token_id") or "")
            if token_id:
                tokens = city.setdefault("condition_tokens", {})
                next_amount = max(0, int(tokens.get(token_id, 0)) + int(payload.get("amount", 0)))
                if next_amount:
                    tokens[token_id] = next_amount
                else:
                    tokens.pop(token_id, None)


def _production_for_card(card: dict[str, Any]) -> Counter:
    return Counter(_counts((card.get("data") or {}).get("production")))


def _event_requirements_met(state: dict[str, Any], requirements: list[dict[str, Any]]) -> bool:
    resources = _counts(state.get("global_resource_pool"))
    tags = _empire_tag_counts(state)
    for requirement in requirements:
        requirement_type = str(requirement.get("type") or "")
        if requirement_type == "resource":
            if int(resources.get(str(requirement.get("item_id") or ""), 0)) < int(requirement.get("amount", 1)):
                return False
        elif requirement_type == "tag":
            if int(tags.get(str(requirement.get("item_id") or ""), 0)) < int(requirement.get("amount", 1)):
                return False
        elif requirement_type == "pillar":
            if not _effect_condition_met(
                state,
                {
                    "source_type": "pillar",
                    "source_id": requirement.get("pillar_id"),
                    "operator": requirement.get("operator"),
                    "value": requirement.get("value"),
                },
            ):
                return False
    return True


def _pay_event_resource_cost(state: dict[str, Any], requirements: list[dict[str, Any]]) -> None:
    pool = Counter(_counts(state.get("global_resource_pool")))
    for requirement in requirements:
        if requirement.get("type") == "resource":
            pool[str(requirement.get("item_id") or "")] -= int(requirement.get("amount", 1))
    state["global_resource_pool"] = _positive_counts(pool)


def _apply_event_effects(
    state: dict[str, Any],
    event: dict[str, Any],
    effects: list[dict[str, Any]],
    *,
    continuation: str,
    requirements_met: bool,
) -> bool:
    for index, effect in enumerate(effects or []):
        if not _effect_condition_met(state, effect.get("condition")):
            continue
        payload = effect.get("payload") or {}
        effect_type = effect.get("effect_type")
        amount = int(payload.get("amount", 1))
        if effect_type == "modify_pillar":
            _modify_pillar(state, str(payload.get("pillar") or payload.get("pillar_id") or ""), amount)
        elif effect_type == "destroy_building":
            _destroy_buildings(state, str(payload.get("tag_id") or ""), max(1, amount))
        elif effect_type == "remove_all_resources":
            state["global_resource_pool"] = {}
        elif effect_type == "modify_resources":
            resource_id = str(payload.get("resource_id") or "")
            if resource_id:
                _modify_resource_pool(state, resource_id, amount)
            else:
                resource_ids = _event_resource_choices(state, amount)
                if not resource_ids:
                    continue
                decision_player = _event_decision_player(state, event, fallback_role="health")
                state["pending_event_resource_effect"] = {
                    "event_id": event["id"],
                    "amount": amount,
                    "resource_ids": resource_ids,
                    "remaining_effects": list(effects[index + 1:]),
                    "continuation": continuation,
                    "requirements_met": requirements_met,
                    "decision_player_id": decision_player,
                }
                state["active_player_id"] = decision_player
                return False
        elif effect_type == "convert_resources":
            source_id = str(payload.get("source_resource_id") or "")
            target_id = str(payload.get("target_resource_id") or "")
            if not source_id:
                source_choices = [
                    resource_id
                    for resource_id in _event_resource_choices(state, -1)
                    if resource_id != target_id
                ]
                if not source_choices:
                    continue
                _set_pending_event_conversion(
                    state,
                    event,
                    amount=max(1, amount),
                    source_id="",
                    target_id=target_id,
                    stage="source",
                    resource_ids=source_choices,
                    remaining_effects=list(effects[index + 1:]),
                    continuation=continuation,
                    requirements_met=requirements_met,
                )
                return False
            if int(state.get("global_resource_pool", {}).get(source_id, 0)) <= 0:
                continue
            if not target_id:
                target_choices = [
                    resource_id
                    for resource_id in _event_resource_choices(state, 1)
                    if resource_id != source_id
                ]
                if not target_choices:
                    continue
                _set_pending_event_conversion(
                    state,
                    event,
                    amount=max(1, amount),
                    source_id=source_id,
                    target_id="",
                    stage="target",
                    resource_ids=target_choices,
                    remaining_effects=list(effects[index + 1:]),
                    continuation=continuation,
                    requirements_met=requirements_met,
                )
                return False
            _convert_resources(state, source_id, target_id, max(1, amount))
        elif effect_type == "draw_card":
            player_id = _event_choice_minister_player(state, event)
            drawn = _draw_empire(state, 3)
            if drawn:
                state["pending_event_draw_choice"] = {
                    "event_id": event["id"],
                    "drawn_ids": drawn,
                    "remaining_effects": list(effects[index + 1:]),
                    "continuation": continuation,
                    "requirements_met": requirements_met,
                    "decision_player_id": player_id,
                }
                state["active_player_id"] = player_id
                return False
        elif effect_type == "suppress_plague_morale":
            state["plague_morale_suppressed"] = True
        elif effect_type == "discard_cards":
            _discard_for_event(state, payload, event)
        elif effect_type in {"modify_plague", "modify_unrest", "modify_fortified"}:
            token_id = f"{effect_type.removeprefix('modify_')}-token"
            if payload.get("scope") == "global":
                _modify_token_count(state.setdefault("condition_tokens", {}), token_id, amount)
            elif state.get("cities"):
                _modify_token_count(
                    state["cities"][0].setdefault("condition_tokens", {}),
                    token_id,
                    amount,
                )
        elif effect_type == "modify_city_tokens" and state.get("cities"):
            if len(state["cities"]) > 1:
                decision_player = _event_choice_minister_player(state, event)
                state["pending_event_city_tokens"] = {
                    "event_id": event["id"],
                    "token_changes": dict(payload.get("tokens") or {}),
                    "city_ids": [city["id"] for city in state["cities"]],
                    "remaining_effects": list(effects[index + 1:]),
                    "continuation": continuation,
                    "requirements_met": requirements_met,
                    "decision_player_id": decision_player,
                }
                state["active_player_id"] = decision_player
                return False
            _apply_city_token_changes(state["cities"][0], payload.get("tokens") or {})
        elif effect_type == "waive_next_structure_tag_requirement":
            state["structure_tag_requirement_waivers"] = (
                int(state.get("structure_tag_requirement_waivers", 0)) + 1
            )
    return True


def _modify_resource_pool(state: dict[str, Any], resource_id: str, amount: int) -> None:
    pool = Counter(_counts(state.get("global_resource_pool")))
    pool[resource_id] = max(0, int(pool.get(resource_id, 0)) + amount)
    state["global_resource_pool"] = _positive_counts(pool)


def _modify_token_count(tokens: dict[str, int], token_id: str, amount: int) -> None:
    next_amount = max(0, int(tokens.get(token_id, 0)) + amount)
    if next_amount:
        tokens[token_id] = next_amount
    else:
        tokens.pop(token_id, None)


def _apply_city_token_changes(city: dict[str, Any], token_changes: dict[str, Any]) -> None:
    city_tokens = city.setdefault("condition_tokens", {})
    for token_id, amount in token_changes.items():
        _modify_token_count(city_tokens, str(token_id), int(amount or 0))


def _event_resource_choices(state: dict[str, Any], amount: int) -> list[str]:
    volatile_ids = [
        entry["id"]
        for entry in state.get("catalog", {}).get("tags", [])
        if (entry.get("data") or {}).get("resource_type") == "volatile"
    ]
    if amount < 0:
        pool = _counts(state.get("global_resource_pool"))
        return [resource_id for resource_id in volatile_ids if int(pool.get(resource_id, 0)) > 0]
    return volatile_ids


def _event_decision_player(
    state: dict[str, Any],
    event: dict[str, Any],
    *,
    fallback_role: str,
) -> str:
    ministry_id = str((event.get("data") or {}).get("ministry_id") or "")
    if ministry_id:
        return (
            str(state.get("ministry_assignments", {}).get(ministry_id) or "")
            or state["minister_of_empire_player_id"]
        )
    return _ministry_holder(state, fallback_role) or state["minister_of_empire_player_id"]


def _event_choice_minister_player(state: dict[str, Any], event: dict[str, Any]) -> str:
    ministry_id = str((event.get("data") or {}).get("ministry_id") or "")
    if ministry_id:
        holder = str(state.get("ministry_assignments", {}).get(ministry_id) or "")
        if holder:
            return holder
    return state["minister_of_empire_player_id"]


def _set_pending_event_conversion(
    state: dict[str, Any],
    event: dict[str, Any],
    *,
    amount: int,
    source_id: str,
    target_id: str,
    stage: str,
    resource_ids: list[str],
    remaining_effects: list[dict[str, Any]],
    continuation: str,
    requirements_met: bool,
) -> None:
    decision_player = _event_decision_player(state, event, fallback_role="health")
    state["pending_event_resource_conversion"] = {
        "event_id": event["id"],
        "amount": amount,
        "source_resource_id": source_id,
        "target_resource_id": target_id,
        "stage": stage,
        "resource_ids": resource_ids,
        "remaining_effects": remaining_effects,
        "continuation": continuation,
        "requirements_met": requirements_met,
        "decision_player_id": decision_player,
    }
    state["active_player_id"] = decision_player


def _convert_resources(
    state: dict[str, Any],
    source_resource_id: str,
    target_resource_id: str,
    amount: int,
) -> None:
    pool = Counter(_counts(state.get("global_resource_pool")))
    converted = min(max(0, amount), int(pool.get(source_resource_id, 0)))
    if converted:
        pool[source_resource_id] -= converted
        pool[target_resource_id] += converted
    state["global_resource_pool"] = _positive_counts(pool)


def _choose_event_conversion_resource(state: dict[str, Any], payload: dict[str, Any]) -> None:
    pending = state.get("pending_event_resource_conversion")
    if not pending:
        raise ValueError("No event resource conversion choice is pending.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    resource_id = str(payload.get("resource_id") or "")
    if resource_id not in pending["resource_ids"]:
        raise ValueError("That resource is not an eligible conversion choice.")
    if pending["stage"] == "source":
        pending["source_resource_id"] = resource_id
        if pending["target_resource_id"]:
            _finish_event_resource_conversion(state, pending)
            return
        pending["stage"] = "target"
        pending["resource_ids"] = [
            candidate
            for candidate in _event_resource_choices(state, 1)
            if candidate != resource_id
        ]
        if not pending["resource_ids"]:
            _resume_after_event_resource_conversion(state, pending)
        return
    pending["target_resource_id"] = resource_id
    _finish_event_resource_conversion(state, pending)


def _finish_event_resource_conversion(state: dict[str, Any], pending: dict[str, Any]) -> None:
    _convert_resources(
        state,
        pending["source_resource_id"],
        pending["target_resource_id"],
        int(pending["amount"]),
    )
    _resume_after_event_resource_conversion(state, pending)


def _resume_after_event_resource_conversion(state: dict[str, Any], pending: dict[str, Any]) -> None:
    event = event_by_id(state, pending["event_id"])
    state["pending_event_resource_conversion"] = None
    completed = _apply_event_effects(
        state,
        event,
        pending["remaining_effects"],
        continuation=pending["continuation"],
        requirements_met=bool(pending["requirements_met"]),
    )
    if completed:
        _complete_event_resolution(
            state,
            event,
            continuation=pending["continuation"],
            requirements_met=bool(pending["requirements_met"]),
        )


def _choose_event_resource(state: dict[str, Any], payload: dict[str, Any]) -> None:
    pending = state.get("pending_event_resource_effect")
    if not pending:
        raise ValueError("No event resource choice is pending.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    resource_id = str(payload.get("resource_id") or "")
    if resource_id not in pending["resource_ids"]:
        raise ValueError("That resource is not an eligible choice.")
    _modify_resource_pool(state, resource_id, int(pending["amount"]))
    event = event_by_id(state, pending["event_id"])
    remaining_effects = pending["remaining_effects"]
    continuation = pending["continuation"]
    requirements_met = bool(pending["requirements_met"])
    state["pending_event_resource_effect"] = None
    completed = _apply_event_effects(
        state,
        event,
        remaining_effects,
        continuation=continuation,
        requirements_met=requirements_met,
    )
    if completed:
        _complete_event_resolution(
            state,
            event,
            continuation=continuation,
            requirements_met=requirements_met,
        )


def _choose_event_token_city(state: dict[str, Any], payload: dict[str, Any]) -> None:
    pending = state.get("pending_event_city_tokens")
    if not pending:
        raise ValueError("No grouped City token choice is pending.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    city_id = str(payload.get("city_id") or "")
    if city_id not in pending["city_ids"]:
        raise ValueError("That City is not an eligible token target.")
    city = next(city for city in state["cities"] if city["id"] == city_id)
    _apply_city_token_changes(city, pending["token_changes"])
    event = event_by_id(state, pending["event_id"])
    remaining_effects = pending["remaining_effects"]
    continuation = pending["continuation"]
    requirements_met = bool(pending["requirements_met"])
    state["pending_event_city_tokens"] = None
    completed = _apply_event_effects(
        state,
        event,
        remaining_effects,
        continuation=continuation,
        requirements_met=requirements_met,
    )
    if completed:
        _complete_event_resolution(
            state,
            event,
            continuation=continuation,
            requirements_met=requirements_met,
        )


def _choose_event_draw(state: dict[str, Any], payload: dict[str, Any]) -> None:
    pending = state.get("pending_event_draw_choice")
    if not pending:
        raise ValueError("No event draw choice is pending.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    draw_index = int(payload.get("draw_index", -1))
    if draw_index < 0 or draw_index >= len(pending["drawn_ids"]):
        raise ValueError("That card is not an eligible draw choice.")
    drawn_ids = list(pending["drawn_ids"])
    kept_id = drawn_ids.pop(draw_index)
    _player(state, pending["decision_player_id"])["hand"].append(kept_id)
    for discarded_id in drawn_ids:
        _discard_empire_item(state, discarded_id)
    event = event_by_id(state, pending["event_id"])
    remaining_effects = pending["remaining_effects"]
    continuation = pending["continuation"]
    requirements_met = bool(pending["requirements_met"])
    state["pending_event_draw_choice"] = None
    state["log"].append(
        f"{_player(state, pending['decision_player_id'])['name']} kept one of three drawn cards."
    )
    completed = _apply_event_effects(
        state,
        event,
        remaining_effects,
        continuation=continuation,
        requirements_met=requirements_met,
    )
    if completed:
        _complete_event_resolution(
            state,
            event,
            continuation=continuation,
            requirements_met=requirements_met,
        )


def _complete_event_resolution(
    state: dict[str, Any],
    event: dict[str, Any],
    *,
    continuation: str,
    requirements_met: bool,
) -> None:
    event_id = event["id"]
    if continuation == "reveal":
        if state.get("current_reveal"):
            state["current_reveal"]["status"] = "resolved"
        _discard_empire_item(state, event_id)
        return
    state["log"].append(
        f"{event.get('name', event_id)} {'resolved' if requirements_met else 'was unresolved'}."
    )
    state["crisis_discard"].append(event_id)
    state["current_crisis_id"] = ""
    _begin_condition(state)


def _effect_condition_met(state: dict[str, Any], condition: dict[str, Any] | None) -> bool:
    if not condition:
        return True
    source_type = str(condition.get("source_type") or condition.get("subject_type") or "tag")
    source_id = str(condition.get("source_id") or condition.get("subject_id") or "")
    if source_type == "pillar":
        current = int(state.get("pillars", {}).get(source_id, 0))
    elif source_type == "resource":
        current = int(state.get("global_resource_pool", {}).get(source_id, 0))
    else:
        current = int(_empire_tag_counts(state).get(source_id, 0))
    if condition.get("target_type") == "tag":
        target = int(_empire_tag_counts(state).get(str(condition.get("target_id") or ""), 0))
    else:
        target = int(condition.get("amount", condition.get("value", 0)))
    operator = str(condition.get("operator") or "gte")
    comparisons = {
        "gt": current > target,
        "gte": current >= target,
        "lt": current < target,
        "lte": current <= target,
        "eq": current == target,
    }
    return comparisons.get(operator, False)


def _agenda_satisfied(state: dict[str, Any], agenda_id: str) -> bool:
    agenda = next(
        (entry for entry in state.get("catalog", {}).get("agendas", []) if entry.get("id") == agenda_id),
        None,
    )
    if not agenda:
        return False
    data = agenda.get("data") or {}
    conditions = data.get("conditions") or ([data["condition"]] if data.get("condition") else [])
    if not conditions:
        return False
    mode = str(data.get("condition_mode") or "all").lower()
    results = [_effect_condition_met(state, condition) for condition in conditions]
    return any(results) if mode == "any" else all(results)


def _destroy_buildings(state: dict[str, Any], tag_id: str, amount: int) -> None:
    destroyed = 0
    for city in state.get("cities", []):
        for card_id in list(city.get("cards", [])):
            card = card_by_id(state, card_id)
            if tag_id and int(_counts((card.get("data") or {}).get("tags")).get(tag_id, 0)) <= 0:
                continue
            city["cards"].remove(card_id)
            _discard_empire_item(state, card_id)
            destroyed += 1
            if destroyed >= amount:
                return


def _discard_for_event(state: dict[str, Any], payload: dict[str, Any], event: dict[str, Any]) -> None:
    target = str(payload.get("target") or "all_players")
    amount_value = payload.get("amount")
    if target == "all_players":
        targets = state["players"]
    else:
        ministry_id = str((event.get("data") or {}).get("ministry_id") or "") if target == "event_minister" else target
        holder = state.get("ministry_assignments", {}).get(ministry_id)
        targets = [_player(state, holder)] if holder else []
    health_holder = _ministry_holder(state, "health")
    for player in targets:
        if player["id"] == health_holder:
            continue
        remaining = len(player["hand"]) + sum(bool(card_id) for card_id in player.get("scheme_slots", [])) \
            if amount_value is None else max(1, int(amount_value))
        while remaining > 0 and player["hand"]:
            _discard_empire_item(state, player["hand"].pop(0))
            remaining -= 1
        for index, card_id in enumerate(player.get("scheme_slots", [])):
            if remaining <= 0:
                break
            if card_id:
                _discard_empire_item(state, card_id)
                player["scheme_slots"][index] = None
                remaining -= 1


def _modify_pillar(state: dict[str, Any], pillar_id: str, amount: int) -> None:
    if not pillar_id:
        return
    entry = next((pillar for pillar in state["catalog"].get("pillars", []) if pillar["id"] == pillar_id), None)
    minimum = int((entry.get("data") or {}).get("min", 0)) if entry else 0
    maximum = int((entry.get("data") or {}).get("max", 10)) if entry else 10
    current = int(state["pillars"].get(pillar_id, 0))
    state["pillars"][pillar_id] = max(minimum, min(maximum, current + amount))


def _pillar_id_by_name(state: dict[str, Any], name: str) -> str:
    normalized = name.strip().lower()
    if normalized in state.get("pillars", {}):
        return normalized
    entry = next(
        (
            pillar
            for pillar in state.get("catalog", {}).get("pillars", [])
            if normalized in f"{pillar.get('id', '')} {pillar.get('name', '')}".lower()
        ),
        None,
    )
    return str(entry.get("id") or "") if entry else normalized


def _storage_capacity(state: dict[str, Any]) -> tuple[int, dict[str, int]]:
    generic = 0
    specific: Counter = Counter()
    for city in state.get("cities", []):
        for card_id in [city.get("city_card_id"), *city.get("cards", [])]:
            if not card_id:
                continue
            card = card_by_id(state, card_id)
            for effect in (card.get("data") or {}).get("persistent_effects", []):
                if effect.get("effect_type") != "storage":
                    continue
                payload = effect.get("payload") or {}
                capacity = max(0, int(payload.get("amount", 0)))
                resource_id = str(payload.get("resource_id") or "")
                if resource_id:
                    specific[resource_id] += capacity
                else:
                    generic += capacity
    return generic, dict(specific)


def _empire_tag_counts(state: dict[str, Any]) -> dict[str, int]:
    tags: Counter = Counter()
    for city in state.get("cities", []):
        for card_id in [city.get("city_card_id"), *city.get("cards", [])]:
            if card_id:
                tags.update(_counts((card_by_id(state, card_id).get("data") or {}).get("tags")))
    return _positive_counts(tags)


def _city_tag_counts(state: dict[str, Any], city: dict[str, Any]) -> dict[str, int]:
    tags: Counter = Counter()
    for card_id in [city.get("city_card_id"), *city.get("cards", [])]:
        if card_id:
            tags.update(_counts((card_by_id(state, card_id).get("data") or {}).get("tags")))
    return _positive_counts(tags)


def _counts(value: Any) -> dict[str, int]:
    if isinstance(value, list):
        return dict(Counter(str(item) for item in value if item))
    if isinstance(value, dict):
        return {
            str(key): int(amount)
            for key, amount in value.items()
            if key and int(amount or 0) != 0
        }
    return {}


def _positive_counts(value: Counter | dict[str, int]) -> dict[str, int]:
    return {str(key): int(amount) for key, amount in value.items() if int(amount) > 0}


def _draw_empire(state: dict[str, Any], amount: int) -> list[str]:
    deck = Deck(state.get("empire_deck", []), discard_ids=state.get("empire_discard", []))
    cards = deck.draw(amount, seed=f"{state['room_id']}:{state['era']}:draw")
    state["empire_deck"] = deck.to_list()
    state["empire_discard"] = deck.discard_list()
    return cards


def _discard_empire_item(state: dict[str, Any], item_id: str) -> None:
    if item_id:
        state.setdefault("empire_discard", []).append(item_id)


def _is_event(item: dict[str, Any]) -> bool:
    return item.get("kind") == "events"


def _is_crisis(item: dict[str, Any]) -> bool:
    return _is_event(item) and str((item.get("data") or {}).get("subtype") or "").lower() == "crisis"


def _is_city_card(card: dict[str, Any]) -> bool:
    return str(card.get("category") or "").lower() == "city"


def _is_ministry(entry: dict[str, Any], role: str) -> bool:
    data = entry.get("data") or {}
    configured_role = str(data.get("role") or "").lower()
    if configured_role:
        return configured_role == role
    normalized = f"{entry.get('id', '')} {entry.get('name', '')}".lower()
    if role == "empire":
        return bool(data.get("is_minister_of_empire")) or "minister-of-the-empire" in normalized or "minister of the empire" in normalized
    aliases = {
        "cities": ("cities", "infrastructure"),
        "state": ("state",),
        "health": ("health", "harvest"),
        "war": ("war",),
    }
    return any(alias in normalized for alias in aliases.get(role, (role,)))


def _ministry_holder(state: dict[str, Any], role: str) -> str:
    ministry = next((entry for entry in state["catalog"].get("ministries", []) if _is_ministry(entry, role)), None)
    return str(state.get("ministry_assignments", {}).get(ministry["id"], "")) if ministry else ""


def _player_has_ministry(state: dict[str, Any], player_id: str, role: str) -> bool:
    return _ministry_holder(state, role) == player_id


def _project_name(state: dict[str, Any], project_id: str) -> str:
    project = next((entry for entry in state.get("stalled_projects", []) if entry["id"] == project_id), None)
    return card_by_id(state, project["card_id"])["name"] if project else project_id


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    player = next((entry for entry in state.get("players", []) if entry.get("id") == player_id), None)
    if not player:
        raise ValueError("Player not found.")
    return player


def _player_index(state: dict[str, Any], player_id: str | None) -> int:
    return next(
        (index for index, player in enumerate(state.get("players", [])) if player.get("id") == player_id),
        0,
    )


def _advance_ordered_player(state: dict[str, Any], *, completed_ids: set[str]) -> None:
    players = state["players"]
    start = _player_index(state, state["active_player_id"])
    for offset in range(1, len(players) + 1):
        candidate = players[(start + offset) % len(players)]["id"]
        if candidate not in completed_ids:
            state["active_player_id"] = candidate
            return


def _require_phase(state: dict[str, Any], phase: str) -> None:
    if state.get("phase") != phase:
        raise ValueError(f"Action is only available during the {phase.replace('_', ' ')} phase.")


def _require_active_player(state: dict[str, Any], payload: dict[str, Any]) -> str:
    player_id = str(payload.get("player_id") or "")
    if player_id != state.get("active_player_id"):
        raise ValueError("It is not this player's decision.")
    return player_id


def _require_decision_player(state: dict[str, Any], payload: dict[str, Any], expected: str) -> None:
    if str(payload.get("player_id") or "") != expected:
        raise ValueError("This decision belongs to another Minister.")
