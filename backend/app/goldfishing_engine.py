from __future__ import annotations

import random
import uuid
from collections import Counter
from copy import deepcopy
from typing import Any


DEFAULT_PLAYER_COUNT = 4
BASE_HAND_SIZE = 2
EMPIRE_HAND_SIZE = 1
NORMAL_REFILL_SIZE = 3
STATE_REFILL_SIZE = 4
SCHEME_SLOTS = 2
MINISTRY_ROTATION_ORDER = ("cities", "state", "war", "health")
AGENDA_SCORING_TAGS = ("culture", "diplomacy", "faith", "industry", "military", "sanitary", "science")

PHASES = (
    "agenda_selection",
    "suspicion",
    "production",
    "plotting",
    "hand_reset",
    "docket_ordering",
    "reveal",
    "condition",
    "storage",
    "crisis_intake",
    "hand_refill",
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
    empire_deck_ids: list[str],
    crisis_deck_ids: list[str],
    setup_pool_ids: list[str],
    empire_deck_id: str,
    crisis_deck_id: str,
    initial_city_card_id: str = "capital-foundation",
    level_id: str = "",
    suspicion_start_era: int = 5,
    player_count: int = DEFAULT_PLAYER_COUNT,
    mode: str = "goldfishing",
    human_player_name: str = "Player 1",
    event_entries: list[dict[str, Any]] | None = None,
    agenda_entries: list[dict[str, Any]] | None = None,
    ministry_entries: list[dict[str, Any]] | None = None,
    pillar_entries: list[dict[str, Any]] | None = None,
    token_entries: list[dict[str, Any]] | None = None,
    effect_icon_entries: list[dict[str, Any]] | None = None,
    image_entries: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if player_count not in {3, 4, 5}:
        raise ValueError("Player count must be between 3 and 5.")
    if mode not in {"goldfishing", "solo_bots"}:
        raise ValueError("Game mode must be goldfishing or solo_bots.")
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

    empire_valid_ids = [
        item_id
        for item_id in empire_deck_ids
        if item_id in item_ids and item_id != initial_city_card_id
    ]
    crisis_ids = [item_id for item_id in crisis_deck_ids if item_id in item_ids]
    setup_counts = Counter(
        item_id
        for item_id in setup_pool_ids
        if item_id in item_ids and item_id != initial_city_card_id
    )
    remaining_setup = Counter(setup_counts)
    empire_ids: list[str] = []
    for item_id in empire_valid_ids:
        if remaining_setup[item_id] > 0:
            remaining_setup[item_id] -= 1
        else:
            empire_ids.append(item_id)
    if any(remaining_setup.values()):
        raise ValueError("Initial setup contains copies that are not present in the selected deck.")
    empire_deck = Deck(empire_ids)
    base_deck = Deck(list(setup_counts.elements()))
    crisis_deck = Deck(crisis_ids)
    empire_deck.shuffle(f"{room_id}:empire")
    base_deck.shuffle(f"{room_id}:base")
    crisis_deck.shuffle(f"{room_id}:crisis")

    players: list[dict[str, Any]] = []
    agenda_deck = Deck([entry["id"] for entry in agendas])
    agenda_deck.shuffle(f"{room_id}:agendas")
    if agendas and len(agendas) < player_count * 2:
        raise ValueError("The Hidden Agenda pool requires at least two cards per player.")
    for index in range(player_count):
        base_cards = base_deck.draw(BASE_HAND_SIZE, seed=f"{room_id}:base:{index}")
        empire_cards = empire_deck.draw(EMPIRE_HAND_SIZE, seed=f"{room_id}:empire:{index}")
        if len(base_cards) < BASE_HAND_SIZE:
            empire_cards.extend(
                empire_deck.draw(BASE_HAND_SIZE - len(base_cards), seed=f"{room_id}:base-fallback:{index}")
            )
        starting_crisis = crisis_deck.draw(1)
        agenda_options = agenda_deck.draw(2)
        players.append(
            {
                "id": f"player-{index + 1}",
                "name": (
                    human_player_name
                    if mode == "solo_bots" and index == 0
                    else f"Bot {index}" if mode == "solo_bots" else f"Player {index + 1}"
                ),
                "controller": "bot" if mode == "solo_bots" and index > 0 else "human",
                "hand": [*base_cards, *empire_cards, *starting_crisis],
                "scheme_slots": [None] * SCHEME_SLOTS,
                "ministry_ids": [],
                "suspicion": 0,
                "committed": False,
                "selected_commitment": None,
                "pending_draws": 0,
                "hidden_agenda_id": "",
                "agenda_options": agenda_options,
            }
        )

    pillar_values = {
        entry["id"]: int((entry.get("data") or {}).get("start", 5))
        for entry in pillars
    }
    if not pillar_values:
        pillar_values = {"treasury": 5, "stability": 5, "morale": 5}

    state: dict[str, Any] = {
        "mode": mode,
        "rules_version": "anonymous-council",
        "room_id": room_id,
        "player_count": player_count,
        "human_player_id": "player-1" if mode == "solo_bots" else "",
        "era": 1,
        "epoch": 1,
        "suspicion_start_era": max(1, int(suspicion_start_era)),
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
        "docket_resolution": [],
        "pending_placement": None,
        "pending_event_resource_effect": None,
        "pending_event_resource_conversion": None,
        "pending_event_city_tokens": None,
        "pending_event_unrest_scope": None,
        "pending_event_destroy_building": None,
        "structure_tag_requirement_waivers": 0,
        "plague_morale_suppressed": False,
        "refill_draw_penalty": 0,
        "war_power_used": False,
        "refill_completed": [],
        "agendas_revealed": False,
        "agenda_results": {},
        "sealed_agenda_count": 0,
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
        "crisis_deck": crisis_deck.to_list(),
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
            "empire": empire_deck_id,
            "crisis": crisis_deck_id,
        },
        "level_id": level_id,
        "log": [
            f"Setup complete. {player_count} players received {BASE_HAND_SIZE} Base cards and "
            f"{EMPIRE_HAND_SIZE} Empire cards."
        ],
    }
    _assign_ministries(state, rotate=False, begin_phase=False)
    state_holder = _ministry_holder(state, "state")
    if state_holder:
        _player(state, state_holder)["hand"].extend(_draw_empire(state, 1))
    _begin_agenda_selection(state)
    return _prepare_state(state)


def perform_action(state: dict[str, Any], action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    next_state = deepcopy(state)
    data = payload or {}
    handlers = {
        "place_suspicion": _place_suspicion,
        "continue_phase": _continue_phase,
        "select_commit_card": _select_commit_card,
        "confirm_plotting": _confirm_plotting,
        "plotting_scheme": _plotting_scheme,
        "choose_agenda": _choose_agenda,
        "move_docket_card": _move_docket_card,
        "confirm_docket_order": _confirm_docket_order,
        "choose_event_resource": _choose_event_resource,
        "choose_event_conversion_resource": _choose_event_conversion_resource,
        "choose_event_token_city": _choose_event_token_city,
        "choose_event_unrest_scope": _choose_event_unrest_scope,
        "choose_event_destroy_building": _choose_event_destroy_building,
        "reveal_next": _reveal_next,
        "place_revealed_card": _place_revealed_card,
        "store_resources": _store_resources,
        "refill_hand": _refill_hand,
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
        _apply_suspicion_depositions(state)
        _begin_production(state)


def _must_commit_face_up(player: dict[str, Any]) -> bool:
    return int(player.get("suspicion", 0)) >= 2


def _cannot_commit_events(state: dict[str, Any], player: dict[str, Any]) -> bool:
    threshold = 2 if len(state.get("players", [])) == 3 else 3
    return int(player.get("suspicion", 0)) >= threshold


def _apply_suspicion_depositions(state: dict[str, Any]) -> None:
    empire_player_id = state["minister_of_empire_player_id"]
    for player in state["players"]:
        player["hand_revealed"] = False
        if player["id"] == empire_player_id or not _cannot_commit_events(state, player):
            continue
        lost_ministry_ids = [
            ministry_id
            for ministry_id in player.get("ministry_ids", [])
            if state.get("ministry_assignments", {}).get(ministry_id) == player["id"]
        ]
        for ministry_id in lost_ministry_ids:
            state["ministry_assignments"].pop(ministry_id, None)
        player["ministry_ids"] = [
            ministry_id for ministry_id in player.get("ministry_ids", [])
            if ministry_id not in lost_ministry_ids
        ]
        state["log"].append(f"{player['name']} was deposed for this Era.")


def _continue_phase(state: dict[str, Any], _payload: dict[str, Any]) -> None:
    phase = state.get("phase")
    if phase == "reveal":
        if state.get("pending_placement"):
            raise ValueError("The revealed card still needs placement.")
        _reveal_next(state, {})
    elif phase == "condition":
        _run_condition_phase(state)
    elif phase == "storage":
        state["stored_resources"] = {}
        state["global_resource_pool"] = {}
        _begin_crisis_intake(state)
    elif phase == "crisis_intake":
        _run_crisis_intake(state)
    elif phase == "hand_reset":
        _run_hand_reset(state)
    elif phase == "cleanup":
        _end_era(state)
    else:
        raise ValueError("The current phase cannot be advanced.")


def _select_commit_card(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_plotting_player(state, payload)
    player = _player(state, player_id)
    source = str(payload.get("source") or "hand")
    index = int(payload.get("index", -1))
    cards = player["hand"] if source == "hand" else player["scheme_slots"] if source == "scheme" else None
    if cards is None or index < 0 or index >= len(cards) or not cards[index]:
        raise ValueError("Committed card is not available.")
    item_id = str(cards[index])
    item = item_by_id(state, item_id)
    if _cannot_commit_events(state, player) and _is_event(item):
        raise ValueError("A deposed player cannot commit an Event.")
    player["selected_commitment"] = {
        "item_id": item_id,
        "source": source,
        "index": index,
        "face_up": _must_commit_face_up(player),
    }


def _confirm_plotting(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_plotting_player(state, payload)
    player = _player(state, player_id)
    selected = player.get("selected_commitment")
    if not selected:
        if _legal_commit_options(state, player):
            raise ValueError("Select a card before confirming Plotting.")
        if _cannot_commit_events(state, player):
            visible_cards = [
                item_id
                for item_id in [*player.get("hand", []), *player.get("scheme_slots", [])]
                if item_id
            ]
            player["hand_revealed"] = bool(visible_cards) and all(
                _is_event(item_by_id(state, item_id)) for item_id in visible_cards
            )
        player["committed"] = True
        state["log"].append(f"{player['name']} could not commit a card.")
        _advance_plotting(state)
        return

    source = str(selected.get("source") or "")
    index = int(selected.get("index", -1))
    cards = player["hand"] if source == "hand" else player["scheme_slots"] if source == "scheme" else None
    if (
        cards is None
        or index < 0
        or index >= len(cards)
        or cards[index] != selected.get("item_id")
    ):
        player["selected_commitment"] = None
        raise ValueError("The selected commitment is no longer available.")
    item_id = str(cards[index])
    item = item_by_id(state, item_id)
    if _cannot_commit_events(state, player) and _is_event(item):
        player["selected_commitment"] = None
        raise ValueError("A deposed player cannot commit an Event.")
    if source == "hand":
        cards.pop(index)
    else:
        cards[index] = None
    face_up = bool(selected.get("face_up"))
    state["commitments"].append(
        {
            "id": f"commitment-{uuid.uuid4().hex[:10]}",
            "item_id": item_id,
            "kind": "events" if _is_event(item) else "cards",
            "owner_player_id": player_id if face_up else "",
            "face_up": face_up,
        }
    )
    player["selected_commitment"] = None
    player["committed"] = True
    state["log"].append(
        f"{player['name']} committed {item.get('name', item_id) if face_up else 'a face-down card'}."
    )
    _advance_plotting(state)


def _plotting_scheme(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "plotting")
    player_id = _require_plotting_player(state, payload)
    player = _player(state, player_id)
    mode = str(payload.get("mode") or "")
    hand_index = int(payload.get("hand_index", -1))
    slot_index = int(payload.get("slot_index", -1))
    if slot_index < 0 or slot_index >= SCHEME_SLOTS:
        raise ValueError("Scheme Slot not found.")
    slot_card = player["scheme_slots"][slot_index]
    selected = player.get("selected_commitment")
    if mode == "to_hand":
        if not slot_card:
            raise ValueError("Scheme Slot is empty.")
        destination_index = len(player["hand"])
        player["scheme_slots"][slot_index] = None
        player["hand"].append(slot_card)
        if selected and selected.get("source") == "scheme" and int(selected.get("index", -1)) == slot_index:
            selected["source"] = "hand"
            selected["index"] = destination_index
    elif mode in {"to_scheme", "swap"}:
        if hand_index < 0 or hand_index >= len(player["hand"]):
            raise ValueError("Hand card not found.")
        if mode == "to_scheme" and slot_card:
            raise ValueError("Scheme Slot is occupied.")
        if mode == "swap" and not slot_card:
            raise ValueError("Scheme Slot is empty.")
        hand_card = player["hand"][hand_index]
        player["scheme_slots"][slot_index] = hand_card
        if slot_card:
            player["hand"][hand_index] = slot_card
        else:
            player["hand"].pop(hand_index)
        if selected and selected.get("source") == "hand":
            selected_index = int(selected.get("index", -1))
            if selected_index == hand_index:
                selected["source"] = "scheme"
                selected["index"] = slot_index
            elif mode == "to_scheme" and hand_index < selected_index:
                selected["index"] = selected_index - 1
        elif (
            selected
            and mode == "swap"
            and selected.get("source") == "scheme"
            and int(selected.get("index", -1)) == slot_index
        ):
            selected["source"] = "hand"
            selected["index"] = hand_index
    else:
        raise ValueError("Unknown Scheme action.")
    state["log"].append(f"{player['name']} rearranged their Scheme Slots.")


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
    if _commitment_is_crisis(state, docket[index]) != _commitment_is_crisis(state, docket[destination]):
        raise ValueError("Crisis cards must remain before all other cards.")
    docket[index], docket[destination] = docket[destination], docket[index]


def _confirm_docket_order(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "docket_ordering")
    _require_active_player(state, payload)
    if not _crises_are_first(state, state.get("council_stack", [])):
        raise ValueError("Every Crisis must resolve before non-Crisis cards.")
    state["phase"] = "reveal"
    state["current_reveal"] = None
    state["revealed_cards"] = []
    state["docket_resolution"] = [
        {
            **commitment,
            "name": item_by_id(state, commitment["item_id"]).get("name") or commitment["item_id"],
            "is_crisis": _is_crisis(item_by_id(state, commitment["item_id"])),
            "status": "queued",
        }
        for commitment in state.get("council_stack", [])
    ]
    state["log"].append("The Minister of the Empire ordered the Council Docket.")


def _reveal_next(state: dict[str, Any], _payload: dict[str, Any]) -> None:
    _require_phase(state, "reveal")
    if state.get("pending_placement"):
        raise ValueError("The current card needs placement.")
    stack = state.get("council_stack", [])
    if not stack:
        _begin_condition(state)
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
    _mark_docket_resolution(state, commitment["id"], "resolving")
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
    _mark_docket_resolution(state, state["current_reveal"]["id"], "built")
    state["pending_placement"] = None


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
    _begin_crisis_intake(state)


def _refill_draw_amount(state: dict[str, Any], player: dict[str, Any]) -> int:
    player_id = str(player.get("id") or "")
    target_size = STATE_REFILL_SIZE if _player_has_ministry(state, player_id, "state") else NORMAL_REFILL_SIZE
    target_size = max(
        0,
        target_size
        + max(0, int(player.get("pending_draws", 0)))
        - max(0, int(state.get("refill_draw_penalty", 0))),
    )
    return max(0, target_size - len(player.get("hand", [])))


def _refill_hand(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "hand_refill")
    player_id = _require_active_player(state, payload)
    player = _player(state, player_id)
    draw_amount = _refill_draw_amount(state, player)
    drawn = _draw_empire(state, draw_amount)
    player["hand"].extend(drawn)
    player["pending_draws"] = 0
    state["log"].append(f"{player['name']} drew {len(drawn)} cards during Hand Refill.")
    state["refill_completed"].append(player_id)
    if len(state["refill_completed"]) == len(state["players"]):
        _begin_cleanup(state)
        return
    _advance_ordered_player(state, completed_ids=set(state["refill_completed"]))


def _assign_ministries(state: dict[str, Any], *, rotate: bool, begin_phase: bool = True) -> None:
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
    for ministry in ministries:
        role = next(
            role for role in MINISTRY_ROTATION_ORDER if _is_ministry(ministry, role)
        )
        holder_index = (current_index + _ministry_role_offset(len(players), role)) % len(players)
        holder = players[holder_index]["id"]
        if holder in state["blocked_players"]:
            continue
        state["ministry_assignments"][ministry["id"]] = holder
        _player(state, holder)["ministry_ids"].append(ministry["id"])

    state["log"].append(
        f"Era {state['era']}: {_player(state, empire_player_id)['name']} is Minister of the Empire."
    )
    if begin_phase:
        _begin_suspicion(state)


def _begin_agenda_selection(state: dict[str, Any]) -> None:
    if not any(player.get("agenda_options") for player in state["players"]):
        _begin_suspicion(state)
        return
    state["phase"] = "agenda_selection"
    state["active_player_id"] = ""
    state["log"].append("Players received their Hidden Agenda options.")


def _choose_agenda(state: dict[str, Any], payload: dict[str, Any]) -> None:
    _require_phase(state, "agenda_selection")
    player_id = str(payload.get("player_id") or "")
    agenda_id = str(payload.get("agenda_id") or "")
    player = _player(state, player_id)
    options = list(player.get("agenda_options") or [])
    if player.get("hidden_agenda_id"):
        raise ValueError("This player already chose a Hidden Agenda.")
    if agenda_id not in options:
        raise ValueError("Hidden Agenda option not found.")
    player["hidden_agenda_id"] = agenda_id
    player["agenda_options"] = []
    state["sealed_agenda_count"] = int(state.get("sealed_agenda_count", 0)) + max(0, len(options) - 1)
    state["log"].append(f"{player['name']} chose a Hidden Agenda.")
    if all(player.get("hidden_agenda_id") or not player.get("agenda_options") for player in state["players"]):
        _begin_suspicion(state)


def _begin_suspicion(state: dict[str, Any]) -> None:
    if int(state.get("era", 1)) < int(state.get("suspicion_start_era", 5)):
        state["log"].append("Suspicion is not active yet.")
        _begin_production(state)
        return
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


def _begin_production(state: dict[str, Any]) -> None:
    state["phase"] = "production"
    state["active_player_id"] = ""
    state["log"].append("Production Phase began.")
    _run_production(state)
    _begin_plotting(state)


def _begin_plotting(state: dict[str, Any]) -> None:
    state["phase"] = "plotting"
    state["commitments"] = []
    state["council_stack"] = []
    state["docket_resolution"] = []
    for player in state["players"]:
        player["committed"] = False
        player["selected_commitment"] = None
    state["active_player_id"] = ""
    state["log"].append("Plotting Phase began.")


def _advance_plotting(state: dict[str, Any]) -> None:
    committed = {player["id"] for player in state["players"] if player.get("committed")}
    if len(committed) < len(state["players"]):
        return
    state["council_stack"] = list(state["commitments"])
    _begin_hand_reset(state)


def _resolve_buildable_item(
    state: dict[str, Any],
    card: dict[str, Any],
    *,
    source: str,
    reference_id: str,
) -> None:
    placements = _legal_placements(state, card)
    if not _requirements_satisfied(state, card) or not _can_pay_cost(state, card) or not placements:
        _discard_item(state, card["id"])
        if state.get("current_reveal"):
            state["current_reveal"]["status"] = "discarded"
        _mark_docket_resolution(state, reference_id, "discarded")
        state["log"].append(f"{card['name']} could not be built and was discarded.")
        return
    if len(placements) == 1:
        _pay_cost(state, card)
        _build_card(state, card, placements[0])
        if state.get("current_reveal"):
            state["current_reveal"]["status"] = "built"
        _mark_docket_resolution(state, reference_id, "built")
        return
    state["pending_placement"] = _placement_payload(state, card, placements, source, reference_id)


def _begin_condition(state: dict[str, Any]) -> None:
    state["current_reveal"] = None
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


def _begin_crisis_intake(state: dict[str, Any]) -> None:
    state["phase"] = "crisis_intake"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Crisis Intake Phase began.")


def _run_crisis_intake(state: dict[str, Any]) -> None:
    if int(state.get("era", 1)) % 5 == 0:
        deck = Deck(state.get("crisis_deck", []))
        for player in state["players"]:
            player["hand"].extend(deck.draw(1))
        state["crisis_deck"] = deck.to_list()
        state["log"].append("Each player drew a Crisis where available.")
    _begin_hand_refill(state)


def _begin_hand_reset(state: dict[str, Any]) -> None:
    state["phase"] = "hand_reset"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Hand Reset Phase began.")


def _run_hand_reset(state: dict[str, Any]) -> None:
    for player in state["players"]:
        crises = []
        for item_id in player["hand"]:
            if _is_crisis(item_by_id(state, item_id)):
                crises.append(item_id)
            else:
                _discard_item(state, item_id)
        player["hand"] = crises
    state["council_stack"] = sorted(
        state.get("council_stack", []),
        key=lambda commitment: 0 if _commitment_is_crisis(state, commitment) else 1,
    )
    state["phase"] = "docket_ordering"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["current_reveal"] = None
    state["revealed_cards"] = []
    state["log"].append("The committed cards were revealed anonymously into the Council Docket.")


def _begin_hand_refill(state: dict[str, Any]) -> None:
    state["phase"] = "hand_refill"
    state["refill_completed"] = []
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Hand Refill Phase began.")


def _begin_cleanup(state: dict[str, Any]) -> None:
    state["phase"] = "cleanup"
    state["active_player_id"] = state["minister_of_empire_player_id"]
    state["log"].append("Cleanup began.")


def _end_era(state: dict[str, Any]) -> None:
    for player in state["players"]:
        player["suspicion"] = 0
        player["committed"] = False
        player["selected_commitment"] = None
        player["hand_revealed"] = False
    state["era"] = int(state.get("era", 1)) + 1
    state["epoch"] = state["era"]
    state["war_power_used"] = False
    state["structure_tag_requirement_waivers"] = 0
    state["plague_morale_suppressed"] = False
    state["refill_draw_penalty"] = 0
    state["suspicion_placements"] = {}
    _assign_ministries(state, rotate=True)


def _possible_actions(state: dict[str, Any]) -> list[dict[str, Any]]:
    phase = state.get("phase")
    active = state.get("active_player_id")
    if phase == "game_over":
        return []
    if phase == "agenda_selection":
        return [
            {"type": "choose_agenda", "player_id": player["id"], "agenda_id": agenda_id}
            for player in state["players"]
            if not player.get("hidden_agenda_id")
            for agenda_id in player.get("agenda_options", [])
        ]
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
    if phase == "plotting":
        actions: list[dict[str, Any]] = []
        for player in state["players"]:
            if player.get("committed"):
                continue
            player_id = player["id"]
            select_actions = [
                {
                    "type": "select_commit_card",
                    "player_id": player_id,
                    "item_id": item_id,
                    "source": source,
                    "index": index,
                    "face_up": _must_commit_face_up(player),
                    "resolution_preview": _plotting_resolution_preview(
                        state,
                        item_by_id(state, item_id),
                    ),
                    "selected": (
                        (player.get("selected_commitment") or {}).get("source") == source
                        and (player.get("selected_commitment") or {}).get("index") == index
                        and (player.get("selected_commitment") or {}).get("item_id") == item_id
                    ),
                }
                for source, index, item_id in _legal_commit_options(state, player)
            ]
            scheme_actions = [
                *[
                    {
                        "type": "plotting_scheme",
                        "player_id": player_id,
                        "hand_index": index,
                        "slot_index": slot_index,
                        "mode": "to_scheme",
                    }
                    for index, item_id in enumerate(player["hand"])
                    if item_id
                    for slot_index, slot_item in enumerate(player["scheme_slots"])
                    if not slot_item
                ],
                *[
                    {
                        "type": "plotting_scheme",
                        "player_id": player_id,
                        "slot_index": slot_index,
                        "mode": "to_hand",
                    }
                    for slot_index, slot_item in enumerate(player["scheme_slots"])
                    if slot_item
                ],
                *[
                    {
                        "type": "plotting_scheme",
                        "player_id": player_id,
                        "hand_index": index,
                        "slot_index": slot_index,
                        "mode": "swap",
                    }
                    for index, item_id in enumerate(player["hand"])
                    if item_id
                    for slot_index, slot_item in enumerate(player["scheme_slots"])
                    if slot_item
                ],
            ]
            actions.extend(select_actions)
            if player.get("selected_commitment") or not select_actions:
                actions.append(
                    {
                        "type": "confirm_plotting",
                        "player_id": player_id,
                        "has_selection": bool(player.get("selected_commitment")),
                    }
                )
            actions.extend(scheme_actions)
        return actions
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
            and _commitment_is_crisis(state, commitment)
            == _commitment_is_crisis(state, docket[index + direction])
        ]
        return [*actions, {"type": "confirm_docket_order", "player_id": active}]
    if phase == "reveal":
        pending_unrest_scope = state.get("pending_event_unrest_scope")
        if pending_unrest_scope:
            return [
                {
                    "type": "choose_event_unrest_scope",
                    "player_id": pending_unrest_scope["decision_player_id"],
                    "scope": scope,
                }
                for scope in ("global", "city")
            ]
        pending_destroy = state.get("pending_event_destroy_building")
        if pending_destroy:
            return [
                {
                    "type": "choose_event_destroy_building",
                    "player_id": pending_destroy["decision_player_id"],
                    "city_id": candidate["city_id"],
                    "card_id": candidate["card_id"],
                }
                for candidate in _eligible_buildings(state, pending_destroy["tag_id"])
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
            if pending_conversion["stage"] == "amount":
                available = int(
                    state.get("global_resource_pool", {}).get(
                        pending_conversion["source_resource_id"],
                        0,
                    )
                )
                return [
                    {
                        "type": "choose_event_conversion_resource",
                        "player_id": pending_conversion["decision_player_id"],
                        "stage": "amount",
                        "amount": amount,
                    }
                    for amount in range(
                        min(int(pending_conversion["amount"]), available) + 1
                    )
                ]
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
    if phase in {"crisis_intake", "hand_reset", "cleanup"}:
        return [{"type": "continue_phase"}]
    if phase == "hand_refill":
        draw_amount = _refill_draw_amount(state, _player(state, active))
        return [{"type": "refill_hand", "player_id": active, "draw_amount": draw_amount}]
    return []


def _prepare_state(state: dict[str, Any]) -> dict[str, Any]:
    state["empire_tags"] = _empire_tag_counts(state)
    generic, specific = _storage_capacity(state)
    state["storage_capacity"] = {"generic": generic, "specific": specific}
    if state.get("phase") != "game_over" and any(int(value) <= 0 for value in state.get("pillars", {}).values()):
        state["phase"] = "game_over"
        state["active_player_id"] = ""
        state["agendas_revealed"] = True
        _score_hidden_agendas(state)
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
    if _cannot_commit_events(state, player):
        options = [
            option for option in options
            if not _is_event(item_by_id(state, option[2]))
        ]
    return options


def _plotting_resolution_preview(state: dict[str, Any], item: dict[str, Any]) -> str:
    if _is_event(item):
        requirements_met = _event_requirements_met(
            state,
            (item.get("data") or {}).get("requirements") or [],
        )
        if requirements_met:
            return "success"
        return "failure" if _is_crisis(item) else "unresolved"
    if (
        _requirements_satisfied(state, item)
        and _can_pay_cost(state, item)
        and _legal_placements(state, item)
    ):
        return "success"
    return "unresolved"


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
            tag_id = str(payload.get("tag_id") or "")
            candidates = _eligible_buildings(state, tag_id)
            destroy_amount = min(max(1, amount), len(candidates))
            if not destroy_amount:
                continue
            if destroy_amount == len(candidates):
                for candidate in candidates:
                    _destroy_building(state, candidate["city_id"], candidate["card_id"])
                continue
            decision_player = _event_decision_player(state, event, fallback_role="war")
            state["pending_event_destroy_building"] = {
                "event_id": event["id"],
                "tag_id": tag_id,
                "remaining": destroy_amount,
                "remaining_effects": list(effects[index + 1:]),
                "continuation": continuation,
                "requirements_met": requirements_met,
                "decision_player_id": decision_player,
            }
            state["active_player_id"] = decision_player
            return False
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
            _set_pending_event_conversion(
                state,
                event,
                amount=max(1, amount),
                source_id=source_id,
                target_id=target_id,
                stage="amount",
                resource_ids=[],
                remaining_effects=list(effects[index + 1:]),
                continuation=continuation,
                requirements_met=requirements_met,
            )
            return False
        elif effect_type == "draw_card":
            player_id = _event_choice_minister_player(state, event)
            player = _player(state, player_id)
            player["pending_draws"] = int(player.get("pending_draws", 0)) + max(1, amount)
            state["log"].append(f"{player['name']} gained a pending draw.")
        elif effect_type == "reduce_refill_draws":
            state["refill_draw_penalty"] = int(state.get("refill_draw_penalty", 0)) + 1
            state["log"].append("All players will draw one fewer card during Hand Refill.")
        elif effect_type == "suppress_plague_morale":
            state["plague_morale_suppressed"] = True
        elif effect_type == "discard_cards":
            _discard_for_event(state, payload, event)
        elif effect_type in {"modify_plague", "modify_unrest", "modify_fortified"}:
            token_id = f"{effect_type.removeprefix('modify_')}-token"
            scope = str(payload.get("scope") or ("unspecified" if effect_type == "modify_unrest" else "city"))
            if effect_type == "modify_unrest" and scope == "unspecified":
                decision_player = _event_decision_player(state, event, fallback_role="state")
                state["pending_event_unrest_scope"] = {
                    "event_id": event["id"],
                    "amount": amount,
                    "remaining_effects": list(effects[index + 1:]),
                    "continuation": continuation,
                    "requirements_met": requirements_met,
                    "decision_player_id": decision_player,
                }
                state["active_player_id"] = decision_player
                return False
            if scope == "global":
                _modify_token_count(state.setdefault("condition_tokens", {}), token_id, amount)
            elif len(state.get("cities", [])) > 1:
                role = {
                    "modify_plague": "health",
                    "modify_unrest": "state",
                    "modify_fortified": "war",
                }[effect_type]
                decision_player = _event_decision_player(state, event, fallback_role=role)
                state["pending_event_city_tokens"] = {
                    "event_id": event["id"],
                    "token_changes": {token_id: amount},
                    "city_ids": [city["id"] for city in state["cities"]],
                    "remaining_effects": list(effects[index + 1:]),
                    "continuation": continuation,
                    "requirements_met": requirements_met,
                    "decision_player_id": decision_player,
                }
                state["active_player_id"] = decision_player
                return False
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
    if pending["stage"] == "amount":
        amount = int(payload.get("amount", -1))
        available = int(state.get("global_resource_pool", {}).get(pending["source_resource_id"], 0))
        if amount < 0 or amount > min(int(pending["amount"]), available):
            raise ValueError("That conversion amount is not available.")
        pending["selected_amount"] = amount
        _finish_event_resource_conversion(state, pending)
        return
    resource_id = str(payload.get("resource_id") or "")
    if resource_id not in pending["resource_ids"]:
        raise ValueError("That resource is not an eligible conversion choice.")
    if pending["stage"] == "source":
        pending["source_resource_id"] = resource_id
        if pending["target_resource_id"]:
            pending["stage"] = "amount"
            pending["resource_ids"] = []
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
    pending["stage"] = "amount"
    pending["resource_ids"] = []


def _finish_event_resource_conversion(state: dict[str, Any], pending: dict[str, Any]) -> None:
    _convert_resources(
        state,
        pending["source_resource_id"],
        pending["target_resource_id"],
        int(pending.get("selected_amount", pending["amount"])),
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


def _choose_event_unrest_scope(state: dict[str, Any], payload: dict[str, Any]) -> None:
    pending = state.get("pending_event_unrest_scope")
    if not pending:
        raise ValueError("No Unrest scope choice is pending.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    scope = str(payload.get("scope") or "")
    if scope not in {"global", "city"}:
        raise ValueError("Unrest must be placed globally or on a City.")
    event = event_by_id(state, pending["event_id"])
    amount = int(pending["amount"])
    state["pending_event_unrest_scope"] = None
    if scope == "global":
        _modify_token_count(
            state.setdefault("condition_tokens", {}),
            "unrest-token",
            amount,
        )
    elif len(state.get("cities", [])) > 1:
        state["pending_event_city_tokens"] = {
            "event_id": event["id"],
            "token_changes": {"unrest-token": amount},
            "city_ids": [city["id"] for city in state["cities"]],
            "remaining_effects": pending["remaining_effects"],
            "continuation": pending["continuation"],
            "requirements_met": pending["requirements_met"],
            "decision_player_id": pending["decision_player_id"],
        }
        return
    elif state.get("cities"):
        _modify_token_count(
            state["cities"][0].setdefault("condition_tokens", {}),
            "unrest-token",
            amount,
        )
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


def _choose_event_destroy_building(state: dict[str, Any], payload: dict[str, Any]) -> None:
    pending = state.get("pending_event_destroy_building")
    if not pending:
        raise ValueError("No Structure destruction choice is pending.")
    _require_decision_player(state, payload, pending["decision_player_id"])
    city_id = str(payload.get("city_id") or "")
    card_id = str(payload.get("card_id") or "")
    candidates = _eligible_buildings(state, pending["tag_id"])
    if not any(
        candidate["city_id"] == city_id and candidate["card_id"] == card_id
        for candidate in candidates
    ):
        raise ValueError("That Structure is not eligible for destruction.")
    _destroy_building(state, city_id, card_id)
    pending["remaining"] = int(pending["remaining"]) - 1
    if pending["remaining"] > 0 and _eligible_buildings(state, pending["tag_id"]):
        return
    event = event_by_id(state, pending["event_id"])
    remaining_effects = pending["remaining_effects"]
    continuation = pending["continuation"]
    requirements_met = bool(pending["requirements_met"])
    state["pending_event_destroy_building"] = None
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
            alternative_effects = (event.get("data") or {}).get("alternative_effects") or []
            outcome = "succeeded" if requirements_met else ("failed" if alternative_effects else "discarded")
            _mark_docket_resolution(state, state["current_reveal"]["id"], outcome)
        _discard_item(state, event_id)
        return
    raise ValueError("Unknown event resolution continuation.")


def _mark_docket_resolution(state: dict[str, Any], commitment_id: str, status: str) -> None:
    for entry in state.get("docket_resolution", []):
        if entry.get("id") == commitment_id:
            entry["status"] = status
            return


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


def _compare_agenda_values(left: int, operator: str, right: int) -> bool:
    return {
        "gt": left > right,
        "gte": left >= right,
        "lt": left < right,
        "lte": left <= right,
        "eq": left == right,
    }.get(str(operator or "gte"), False)


def _empire_production_counts(state: dict[str, Any]) -> dict[str, int]:
    production: Counter = Counter()
    for city in state.get("cities", []):
        for card_id in [city.get("city_card_id"), *city.get("cards", [])]:
            if card_id:
                production.update(_production_for_card(card_by_id(state, card_id)))
    return _positive_counts(production)


def _agenda_pillar_value(state: dict[str, Any], pillar_name: str) -> int | None:
    normalized = str(pillar_name or "").lower()
    short_name = normalized.removeprefix("pillar-of-")
    for pillar_id, value in state.get("pillars", {}).items():
        entry = next(
            (pillar for pillar in state.get("catalog", {}).get("pillars", []) if pillar.get("id") == pillar_id),
            {},
        )
        identity = f"{pillar_id} {entry.get('name', '')}".lower()
        if (
            normalized == str(pillar_id).lower()
            or normalized in identity
            or short_name == str(pillar_id).lower()
            or short_name in identity
        ):
            return int(value)
    return None


def _agenda_token_count(state: dict[str, Any], token_name: str, scope: str) -> int:
    normalized = str(token_name or "").lower().replace("_", "-")
    if normalized == "global-unrest":
        return int(_counts(state.get("condition_tokens")).get("unrest-token", 0))
    token_id = normalized if normalized.endswith("-token") else f"{normalized}-token"
    total = int(_counts(state.get("condition_tokens")).get(token_id, 0))
    if scope == "empire":
        total += sum(
            int(_counts(city.get("condition_tokens")).get(token_id, 0))
            for city in state.get("cities", [])
        )
    return total


def _agenda_condition_met(state: dict[str, Any], condition: dict[str, Any]) -> bool:
    condition_type = str(condition.get("type") or "")
    tags = _empire_tag_counts(state)
    production = _empire_production_counts(state)
    operator = str(condition.get("operator") or "gte")
    amount = int(condition.get("amount") or 0)
    if condition_type == "tag_count":
        return _compare_agenda_values(int(tags.get(str(condition.get("tag") or ""), 0)), operator, amount)
    if condition_type == "tag_compare":
        return _compare_agenda_values(
            int(tags.get(str(condition.get("left") or ""), 0)),
            operator,
            int(tags.get(str(condition.get("right") or ""), 0)),
        )
    if condition_type == "tag_sum_compare":
        left = sum(int(tags.get(str(tag_id), 0)) for tag_id in condition.get("left_tags", []))
        right = sum(int(tags.get(str(tag_id), 0)) for tag_id in condition.get("right_tags", []))
        return _compare_agenda_values(left, operator, right)
    if condition_type == "production":
        return _compare_agenda_values(
            int(production.get(str(condition.get("resource") or ""), 0)),
            operator,
            amount,
        )
    if condition_type == "capacity":
        resource_id = str(condition.get("resource") or "")
        capacity = int(production.get(resource_id, 0)) + int(_counts(state.get("stored_resources")).get(resource_id, 0))
        return _compare_agenda_values(capacity, operator, amount)
    if condition_type in {"collapsed_pillar", "not_collapsed_pillar"}:
        value = _agenda_pillar_value(state, str(condition.get("pillar") or ""))
        collapsed = value is not None and value <= 0
        return collapsed if condition_type == "collapsed_pillar" else not collapsed
    if condition_type == "highest_surviving_pillar":
        value = _agenda_pillar_value(state, str(condition.get("pillar") or ""))
        surviving = [int(item) for item in state.get("pillars", {}).values() if int(item) > 0]
        return value is not None and value > 0 and bool(surviving) and value == max(surviving)
    if condition_type == "token_count":
        current = _agenda_token_count(state, str(condition.get("token") or ""), str(condition.get("scope") or "empire"))
        return _compare_agenda_values(current, operator, amount)
    if condition_type == "tag_plus_token_count":
        current = int(tags.get(str(condition.get("tag") or ""), 0)) + _agenda_token_count(
            state,
            str(condition.get("token") or ""),
            str(condition.get("scope") or "empire"),
        )
        return _compare_agenda_values(current, operator, amount)
    if condition_type == "no_city_has_plague_exceeding_sanitary":
        return all(
            int(_counts(city.get("condition_tokens")).get("plague-token", 0))
            <= int(_city_tag_counts(state, city).get("sanitary", 0))
            for city in state.get("cities", [])
        )
    if condition_type == "distinct_tags_at_least":
        minimum_each = int(condition.get("minimum_each") or 1)
        distinct = sum(
            int(tags.get(str(tag_id), 0)) >= minimum_each
            for tag_id in condition.get("tags", [])
        )
        return distinct >= int(condition.get("minimum_distinct") or 0)
    if condition_type == "all_tags_at_most":
        return all(
            int(tags.get(str(tag_id), 0)) <= amount
            for tag_id in condition.get("tags", [])
        )
    if condition_type == "tag_is_highest":
        values = [int(tags.get(tag_id, 0)) for tag_id in AGENDA_SCORING_TAGS]
        return bool(values) and max(values) > 0 and int(tags.get(str(condition.get("tag") or ""), 0)) == max(values)
    return False


def _agenda_evaluation(state: dict[str, Any], agenda_id: str) -> dict[str, Any]:
    agenda = next(
        (entry for entry in state.get("catalog", {}).get("agendas", []) if entry.get("id") == agenda_id),
        None,
    )
    if not agenda:
        return {"agenda_id": agenda_id, "eligible": False, "score": 0, "sections": {}}
    data = agenda.get("data") or {}
    sections: dict[str, bool] = {}
    score = 0
    for section_name in ("primary", "secondary", "collapse", "forbidden"):
        section = data.get(section_name) or {}
        conditions = section.get("conditions") or []
        met = bool(conditions) and all(_agenda_condition_met(state, condition) for condition in conditions)
        sections[section_name] = met
        if section_name != "forbidden" and met:
            score += int(section.get("points") or 0)
    eligible = (
        sections.get("primary", False)
        and not sections.get("forbidden", False)
        and score >= int(data.get("win_threshold") or 6)
    )
    return {
        "agenda_id": agenda_id,
        "eligible": eligible,
        "score": score,
        "sections": sections,
    }


def _score_hidden_agendas(state: dict[str, Any]) -> None:
    results = {
        player["id"]: _agenda_evaluation(state, player.get("hidden_agenda_id", ""))
        for player in state.get("players", [])
    }
    state["agenda_results"] = results
    eligible = [
        player
        for player in state.get("players", [])
        if results[player["id"]]["eligible"]
    ]
    if not eligible:
        state["winner_player_ids"] = []
        return
    highest_score = max(results[player["id"]]["score"] for player in eligible)
    finalists = [player for player in eligible if results[player["id"]]["score"] == highest_score]
    highest_cards = max(
        len(player.get("hand", [])) + sum(bool(card_id) for card_id in player.get("scheme_slots", []))
        for player in finalists
    )
    state["winner_player_ids"] = [
        player["id"]
        for player in finalists
        if len(player.get("hand", [])) + sum(bool(card_id) for card_id in player.get("scheme_slots", []))
        == highest_cards
    ]


def _eligible_buildings(state: dict[str, Any], tag_id: str) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    for city in state.get("cities", []):
        for card_id in city.get("cards", []):
            card = card_by_id(state, card_id)
            if tag_id and int(_counts((card.get("data") or {}).get("tags")).get(tag_id, 0)) <= 0:
                continue
            candidates.append({"city_id": city["id"], "card_id": card_id})
    return candidates


def _destroy_building(state: dict[str, Any], city_id: str, card_id: str) -> None:
    city = next(
        (candidate for candidate in state.get("cities", []) if candidate["id"] == city_id),
        None,
    )
    if not city or card_id not in city.get("cards", []):
        raise ValueError("Structure not found.")
    city["cards"].remove(card_id)
    _discard_item(state, card_id)


def _discard_for_event(state: dict[str, Any], payload: dict[str, Any], event: dict[str, Any]) -> None:
    target = str(payload.get("target") or "all_players")
    amount_value = payload.get("amount")
    if target == "all_players":
        targets = state["players"]
    else:
        ministry_id = str((event.get("data") or {}).get("ministry_id") or "") if target == "event_minister" else target
        holder = state.get("ministry_assignments", {}).get(ministry_id)
        targets = [_player(state, holder)] if holder else []
    for player in targets:
        remaining = len(player["hand"]) + sum(bool(card_id) for card_id in player.get("scheme_slots", [])) \
            if amount_value is None else max(1, int(amount_value))
        while remaining > 0 and player["hand"]:
            _discard_item(state, player["hand"].pop(0))
            remaining -= 1
        for index, card_id in enumerate(player.get("scheme_slots", [])):
            if remaining <= 0:
                break
            if card_id:
                _discard_item(state, card_id)
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


def _discard_item(state: dict[str, Any], item_id: str) -> None:
    if not item_id:
        return
    if _is_crisis(item_by_id(state, item_id)):
        state.setdefault("crisis_discard", []).append(item_id)
    else:
        state.setdefault("empire_discard", []).append(item_id)


def _is_event(item: dict[str, Any]) -> bool:
    return item.get("kind") == "events"


def _is_crisis(item: dict[str, Any]) -> bool:
    return _is_event(item) and str((item.get("data") or {}).get("subtype") or "").lower() == "crisis"


def _commitment_is_crisis(state: dict[str, Any], commitment: dict[str, Any]) -> bool:
    return _is_crisis(item_by_id(state, str(commitment.get("item_id") or "")))


def _crises_are_first(state: dict[str, Any], docket: list[dict[str, Any]]) -> bool:
    non_crisis_seen = False
    for commitment in docket:
        if _commitment_is_crisis(state, commitment):
            if non_crisis_seen:
                return False
        else:
            non_crisis_seen = True
    return True


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


def _ministry_role_offset(player_count: int, role: str) -> int:
    offsets = {
        3: {"war": 1, "cities": 1, "state": 2, "health": 2},
        4: {"war": 1, "state": 2, "cities": 3, "health": 3},
        5: {"war": 1, "state": 2, "cities": 3, "health": 4},
    }
    try:
        return offsets[player_count][role]
    except KeyError as exc:
        raise ValueError("Ministry assignments require three to five players.") from exc


def _ministry_holder(state: dict[str, Any], role: str) -> str:
    ministry = next((entry for entry in state["catalog"].get("ministries", []) if _is_ministry(entry, role)), None)
    return str(state.get("ministry_assignments", {}).get(ministry["id"], "")) if ministry else ""


def _player_has_ministry(state: dict[str, Any], player_id: str, role: str) -> bool:
    return _ministry_holder(state, role) == player_id


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


def _require_plotting_player(state: dict[str, Any], payload: dict[str, Any]) -> str:
    player_id = str(payload.get("player_id") or "")
    player = next((entry for entry in state.get("players", []) if entry["id"] == player_id), None)
    if player is None:
        raise ValueError("Plotting player not found.")
    if player.get("committed"):
        raise ValueError("This player already committed for this Plotting Phase.")
    return player_id


def _require_decision_player(state: dict[str, Any], payload: dict[str, Any], expected: str) -> None:
    if str(payload.get("player_id") or "") != expected:
        raise ValueError("This decision belongs to another Minister.")
