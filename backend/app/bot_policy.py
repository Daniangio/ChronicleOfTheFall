from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from copy import deepcopy
from typing import Any

from .goldfishing_engine import (
    MINISTRY_ROTATION_ORDER,
    _agenda_condition_met,
    _can_pay_cost,
    _city_tag_counts,
    _counts,
    _empire_tag_counts,
    _event_requirements_met,
    _is_city_card,
    _is_crisis,
    _is_event,
    _is_ministry,
    _legal_placements,
    _ministry_holder,
    _ministry_role_offset,
    _production_for_card,
    _storage_capacity,
    item_by_id,
    perform_action,
)


MAX_BOT_STEPS = 128
SCHEME_HORIZON_ERAS = 3
MINISTER_CONTROL_BONUS = 2.0
RESOURCE_VALUES = {
    "labor": 1.0,
    "food": 1.0,
    "favor": 1.0,
    "material": 1.8,
    "influence": 1.8,
    "wealth": 1.8,
    "knowledge": 3.2,
}
TOKEN_VALUES = {
    "plague-token": -2.5,
    "unrest-token": -2.5,
    "fortified-token": 1.5,
}


def advance_bot_players(state: dict[str, Any]) -> dict[str, Any]:
    if state.get("mode") != "solo_bots":
        return state
    next_state = state
    for _ in range(MAX_BOT_STEPS):
        action = _automatic_system_action(next_state) or choose_next_bot_action(next_state)
        if action is None:
            return next_state
        action_type = str(action.get("type") or "")
        payload = {key: value for key, value in action.items() if key != "type"}
        next_state = perform_action(next_state, action_type, payload)
        if action_type == "plotting_scheme":
            player = _player(next_state, str(payload.get("player_id") or ""))
            player["bot_scheme_adjusted_era"] = int(next_state.get("era", 1))
    raise RuntimeError("Bot action loop exceeded its safety limit.")


def _automatic_system_action(state: dict[str, Any]) -> dict[str, Any] | None:
    actions = list(state.get("possible_actions") or [])
    if len(actions) == 1 and not actions[0].get("player_id"):
        if actions[0].get("type") == "reveal_next":
            return None
        return actions[0]
    return None


def public_game_state(state: dict[str, Any]) -> dict[str, Any]:
    if state.get("mode") != "solo_bots":
        return state
    public = deepcopy(state)
    human_player_id = str(state.get("human_player_id") or "player-1")
    reveal_agendas = bool(state.get("agendas_revealed"))
    for source, player in zip(state.get("players", []), public.get("players", [])):
        player["agenda_selected"] = bool(source.get("hidden_agenda_id"))
        player["hand_count"] = len(source.get("hand", []))
        player["scheme_count"] = sum(bool(item_id) for item_id in source.get("scheme_slots", []))
        if source.get("id") != human_player_id:
            if not source.get("hand_revealed"):
                player["hand"] = []
                player["scheme_slots"] = [None] * len(source.get("scheme_slots", []))
            if not reveal_agendas:
                player["hidden_agenda_id"] = ""
            player["agenda_options"] = []
        for key in list(player):
            if key.startswith("bot_"):
                player.pop(key, None)
    public["possible_actions"] = [
        action
        for action in public.get("possible_actions", [])
        if not action.get("player_id") or action.get("player_id") == human_player_id
    ]
    return public


def require_human_action(state: dict[str, Any], payload: dict[str, Any]) -> None:
    if state.get("mode") != "solo_bots":
        return
    player_id = str(payload.get("player_id") or "")
    if player_id and player_id != str(state.get("human_player_id") or "player-1"):
        raise ValueError("The human player cannot perform an action for a bot.")


def choose_next_bot_action(state: dict[str, Any]) -> dict[str, Any] | None:
    actions = list(state.get("possible_actions") or [])
    if not actions:
        return None
    bot_ids = {
        player["id"]
        for player in state.get("players", [])
        if player.get("controller") == "bot"
    }
    actionable_bot_ids = [
        player["id"]
        for player in state.get("players", [])
        if player["id"] in bot_ids and any(action.get("player_id") == player["id"] for action in actions)
    ]
    if not actionable_bot_ids:
        return None
    bot_id = actionable_bot_ids[0]
    bot_actions = [action for action in actions if action.get("player_id") == bot_id]
    phase = str(state.get("phase") or "")
    if phase == "agenda_selection":
        return max(
            bot_actions,
            key=lambda action: (
                _agenda_potential(state, str(action.get("agenda_id") or "")),
                _stable_action_key(action),
            ),
        )
    if phase == "suspicion":
        return next(
            (action for action in bot_actions if not action.get("target_player_id")),
            bot_actions[0],
        )
    if phase == "plotting":
        return _choose_plotting_action(state, bot_id, bot_actions)
    if phase == "docket_ordering":
        return _choose_docket_action(state, bot_id, bot_actions)
    if bot_actions[0].get("type") == "store_resources":
        return {
            **bot_actions[0],
            "resources": _choose_storage(state, bot_id),
        }
    return max(
        bot_actions,
        key=lambda action: (_action_value(state, bot_id, action), _stable_action_key(action)),
    )


def _choose_plotting_action(
    state: dict[str, Any],
    bot_id: str,
    actions: list[dict[str, Any]],
) -> dict[str, Any]:
    player = _player(state, bot_id)
    confirm_action = next(
        (action for action in actions if action["type"] == "confirm_plotting"),
        None,
    )
    if player.get("selected_commitment") and confirm_action:
        return confirm_action
    already_adjusted = int(player.get("bot_scheme_adjusted_era", 0)) == int(state.get("era", 1))
    select_actions = [action for action in actions if action["type"] == "select_commit_card"]
    if not already_adjusted:
        scheme_action = _choose_scheme_action(state, bot_id, actions)
        if scheme_action is not None:
            return scheme_action
    playable = [
        action
        for action in select_actions
        if _item_playable_now(state, item_by_id(state, str(action.get("item_id") or "")))
    ]
    candidates = playable or select_actions
    if not candidates:
        if confirm_action:
            return confirm_action
        raise ValueError("Bot has no Plotting action.")
    return max(
        candidates,
        key=lambda action: (
            _item_value(state, item_by_id(state, str(action.get("item_id") or "")), bot_id),
            action.get("source") == "scheme",
            _stable_action_key(action),
        ),
    )


def _choose_scheme_action(
    state: dict[str, Any],
    bot_id: str,
    actions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    player = _player(state, bot_id)
    legal_commit_count = sum(action["type"] == "select_commit_card" for action in actions)
    if legal_commit_count < 2:
        return None
    hand_candidates: list[tuple[float, int, str, int]] = []
    for index, item_id in enumerate(player.get("hand", [])):
        item = item_by_id(state, item_id)
        if _item_playable_now(state, item):
            continue
        readiness = _readiness_turns(state, item)
        if not 1 <= readiness <= SCHEME_HORIZON_ERAS:
            continue
        score = _item_value(state, item, bot_id, eras_ahead=readiness, assume_ready=True)
        if score > 2.0:
            hand_candidates.append((score, readiness, item_id, index))
    if not hand_candidates:
        return None
    candidate_score, _, _, hand_index = max(
        hand_candidates,
        key=lambda entry: (entry[0], -entry[1], entry[2]),
    )
    empty_slot = next(
        (index for index, item_id in enumerate(player.get("scheme_slots", [])) if not item_id),
        None,
    )
    if empty_slot is not None:
        return next(
            (
                action
                for action in actions
                if action["type"] == "plotting_scheme"
                and action.get("mode") == "to_scheme"
                and action.get("hand_index") == hand_index
                and action.get("slot_index") == empty_slot
            ),
            None,
        )
    existing = [
        (
            _item_value(state, item_by_id(state, item_id), bot_id, assume_ready=True),
            index,
        )
        for index, item_id in enumerate(player.get("scheme_slots", []))
        if item_id
    ]
    if not existing:
        return None
    lowest_score, slot_index = min(existing)
    if candidate_score <= lowest_score + 1.0:
        return None
    return next(
        (
            action
            for action in actions
            if action["type"] == "plotting_scheme"
            and action.get("mode") == "swap"
            and action.get("hand_index") == hand_index
            and action.get("slot_index") == slot_index
        ),
        None,
    )


def _choose_docket_action(
    state: dict[str, Any],
    bot_id: str,
    actions: list[dict[str, Any]],
) -> dict[str, Any]:
    docket = list(state.get("council_stack", []))
    dependency_bonus: Counter = Counter()
    for provider in docket:
        provider_item = item_by_id(state, provider["item_id"])
        provided_tags = _counts((provider_item.get("data") or {}).get("tags"))
        for consumer in docket:
            if consumer["id"] == provider["id"]:
                continue
            required = _counts((item_by_id(state, consumer["item_id"]).get("data") or {}).get("required_tags"))
            dependency_bonus[provider["id"]] += sum(
                min(amount, int(required.get(tag_id, 0)))
                for tag_id, amount in provided_tags.items()
            )
    desired = sorted(
        docket,
        key=lambda commitment: (
            0 if _is_crisis(item_by_id(state, commitment["item_id"])) else 1,
            -dependency_bonus[commitment["id"]],
            -_item_value(state, item_by_id(state, commitment["item_id"]), bot_id),
            commitment["id"],
        ),
    )
    desired_ids = [commitment["id"] for commitment in desired]
    current_ids = [commitment["id"] for commitment in docket]
    if current_ids == desired_ids:
        return next(action for action in actions if action["type"] == "confirm_docket_order")
    for target_index, commitment_id in enumerate(desired_ids):
        current_index = current_ids.index(commitment_id)
        if current_index <= target_index:
            continue
        move = next(
            (
                action
                for action in actions
                if action["type"] == "move_docket_card"
                and action.get("commitment_id") == commitment_id
                and action.get("direction") == -1
            ),
            None,
        )
        if move is not None:
            return move
    return next(action for action in actions if action["type"] == "confirm_docket_order")


def _action_value(state: dict[str, Any], bot_id: str, action: dict[str, Any]) -> float:
    action_type = str(action.get("type") or "")
    if action_type == "choose_event_conversion_resource" and action.get("stage") in {"source", "target"}:
        resource_value = _resource_value(state, bot_id, str(action.get("resource_id") or ""))
        return -resource_value if action["stage"] == "source" else resource_value
    if action_type == "choose_event_resource":
        amount = int(action.get("amount") or 0)
        return _resource_value(state, bot_id, str(action.get("resource_id") or "")) * amount
    try:
        payload = {key: value for key, value in action.items() if key != "type"}
        successor = perform_action(state, action_type, payload)
    except (KeyError, TypeError, ValueError):
        return float("-inf")
    return _board_value(successor, bot_id)


def _choose_storage(state: dict[str, Any], bot_id: str) -> dict[str, int]:
    pool = Counter(_counts(state.get("global_resource_pool")))
    generic_capacity, specific_capacity = _storage_capacity(state)
    selected: Counter = Counter()
    for resource_id, capacity in specific_capacity.items():
        amount = min(int(capacity), int(pool.get(resource_id, 0)))
        if amount > 0:
            selected[resource_id] += amount
            pool[resource_id] -= amount
    units = [
        (_resource_value(state, bot_id, resource_id), resource_id)
        for resource_id, amount in pool.items()
        for _ in range(max(0, int(amount)))
    ]
    units.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    for value, resource_id in units[:generic_capacity]:
        if value > 0:
            selected[resource_id] += 1
    return dict(selected)


def _board_value(state: dict[str, Any], bot_id: str) -> float:
    profile = _agenda_profile(state, bot_id)
    tags = _empire_tag_counts(state)
    production = _production_counts(state)
    score = 0.0
    for tag_id, amount in tags.items():
        score += int(amount) * (1.0 + profile["tags"].get(tag_id, 0.0))
    resources = Counter(_counts(state.get("global_resource_pool")))
    resources.update(_counts(state.get("stored_resources")))
    for resource_id, amount in resources.items():
        score += int(amount) * _resource_value(state, bot_id, resource_id)
    for resource_id, amount in production.items():
        score += int(amount) * (1.5 + profile["resources"].get(resource_id, 0.0))
    for pillar_id, amount in state.get("pillars", {}).items():
        score += int(amount) * (0.75 + profile["pillars"].get(pillar_id, 0.0))
    for token_id, amount in _all_token_counts(state).items():
        score += int(amount) * (TOKEN_VALUES.get(token_id, 0.0) + profile["tokens"].get(token_id, 0.0))
    score += sum(max(0, int(city.get("building_slots", 0)) - len(city.get("cards", []))) for city in state.get("cities", [])) * 0.3
    agenda = _agenda_for_player(state, bot_id)
    if agenda:
        for section_name, weight in (("primary", 5.0), ("secondary", 2.5), ("collapse", 2.5)):
            conditions = ((agenda.get("data") or {}).get(section_name) or {}).get("conditions") or []
            if conditions and all(_agenda_condition_met(state, condition) for condition in conditions):
                score += weight
        forbidden = ((agenda.get("data") or {}).get("forbidden") or {}).get("conditions") or []
        if forbidden and all(_agenda_condition_met(state, condition) for condition in forbidden):
            score -= 12.0
    return score


def _item_value(
    state: dict[str, Any],
    item: dict[str, Any],
    bot_id: str,
    *,
    eras_ahead: int = 0,
    assume_ready: bool = False,
) -> float:
    profile = _agenda_profile(state, bot_id)
    data = item.get("data") or {}
    value = 0.0
    if _is_event(item):
        requirements_met = assume_ready or _event_requirements_met(state, data.get("requirements") or [])
        effects = data.get("main_effects", []) if requirements_met else data.get("alternative_effects", [])
        value += _effects_value(state, effects, bot_id, profile)
        value -= sum(
            int(requirement.get("amount", 1)) * RESOURCE_VALUES.get(str(requirement.get("item_id") or ""), 1.0) * 0.4
            for requirement in data.get("requirements", [])
            if requirement.get("type") == "resource" and requirements_met
        )
    else:
        for tag_id, amount in _counts(data.get("tags")).items():
            value += amount * (2.0 + profile["tags"].get(tag_id, 0.0))
        for resource_id, amount in _counts(data.get("production")).items():
            value += amount * (2.5 + profile["resources"].get(resource_id, 0.0))
        value += _effects_value(
            state,
            [*data.get("on_build_effects", []), *data.get("persistent_effects", [])],
            bot_id,
            profile,
        )
        value -= sum(
            amount * RESOURCE_VALUES.get(resource_id, 1.0) * 0.4
            for resource_id, amount in _counts(data.get("cost")).items()
        )
        value -= sum(_counts(data.get("required_tags")).values()) * 0.25
        if _is_city_card(item):
            value += int(data.get("building_slots") or 0) * 0.5
    value += _minister_control_value(state, item, bot_id, eras_ahead)
    if _item_playable_now(state, item):
        value += 1.5
    return value


def _effects_value(
    state: dict[str, Any],
    effects: list[dict[str, Any]],
    bot_id: str,
    profile: dict[str, defaultdict[str, float]],
) -> float:
    value = 0.0
    for effect in effects or []:
        payload = effect.get("payload") or {}
        effect_type = str(effect.get("effect_type") or "")
        amount = int(payload.get("amount", 1))
        if effect_type == "modify_pillar":
            pillar_id = str(payload.get("pillar_id") or payload.get("pillar") or "")
            value += amount * (0.75 + profile["pillars"].get(pillar_id, 0.0))
        elif effect_type == "modify_resources":
            resource_id = str(payload.get("resource_id") or "")
            if resource_id:
                value += amount * _resource_value(state, bot_id, resource_id)
            else:
                values = [_resource_value(state, bot_id, entry["id"]) for entry in _volatile_resources(state)]
                value += amount * (max(values) if amount >= 0 else min(values)) if values else 0
        elif effect_type == "convert_resources":
            source_id = str(payload.get("source_resource_id") or "")
            target_id = str(payload.get("target_resource_id") or "")
            source_value = _resource_value(state, bot_id, source_id) if source_id else min(
                (_resource_value(state, bot_id, entry["id"]) for entry in _volatile_resources(state)),
                default=0.0,
            )
            target_value = _resource_value(state, bot_id, target_id) if target_id else max(
                (_resource_value(state, bot_id, entry["id"]) for entry in _volatile_resources(state)),
                default=0.0,
            )
            value += max(0.0, target_value - source_value) * max(1, amount)
        elif effect_type in {"modify_plague", "modify_unrest", "modify_fortified"}:
            token_id = f"{effect_type.removeprefix('modify_')}-token"
            value += amount * (TOKEN_VALUES.get(token_id, 0.0) + profile["tokens"].get(token_id, 0.0))
        elif effect_type == "modify_city_tokens":
            for token_id, token_amount in _counts(payload.get("tokens")).items():
                value += token_amount * (TOKEN_VALUES.get(token_id, 0.0) + profile["tokens"].get(token_id, 0.0))
        elif effect_type == "modify_token":
            token_id = str(payload.get("token_id") or "")
            value += amount * (TOKEN_VALUES.get(token_id, 0.0) + profile["tokens"].get(token_id, 0.0))
        elif effect_type == "storage":
            value += max(0, amount) * 0.8
        elif effect_type == "add_building_slots":
            value += max(0, amount) * 1.2
        elif effect_type == "draw_card":
            value += max(1, amount) * 1.5
        elif effect_type == "reduce_refill_draws":
            value -= 1.5
        elif effect_type == "destroy_building":
            value -= max(1, amount) * 2.5
        elif effect_type == "remove_all_resources":
            value -= sum(_counts(state.get("global_resource_pool")).values()) * 1.2
        elif effect_type == "discard_cards":
            value -= max(1, amount)
        elif effect_type == "suppress_plague_morale":
            value += max(1, _all_token_counts(state).get("plague-token", 0)) * 1.5
        elif effect_type == "waive_next_structure_tag_requirement":
            value += 2.0
    return value


def _agenda_profile(state: dict[str, Any], player_id: str) -> dict[str, defaultdict[str, float]]:
    profile = {
        "tags": defaultdict(float),
        "resources": defaultdict(float),
        "pillars": defaultdict(float),
        "tokens": defaultdict(float),
    }
    agenda = _agenda_for_player(state, player_id)
    if not agenda:
        return profile
    data = agenda.get("data") or {}
    for section_name, section_weight in (("primary", 4.0), ("secondary", 2.0), ("collapse", 2.0), ("forbidden", -4.0)):
        conditions = (data.get(section_name) or {}).get("conditions") or []
        for condition in conditions:
            met = _agenda_condition_met(state, condition)
            effective_weight = section_weight
            if section_name == "forbidden" and met:
                effective_weight *= 1.5
            elif section_name != "forbidden" and met:
                effective_weight *= 0.1
            _apply_condition_preferences(profile, condition, effective_weight)
    return profile


def _apply_condition_preferences(
    profile: dict[str, defaultdict[str, float]],
    condition: dict[str, Any],
    weight: float,
) -> None:
    condition_type = str(condition.get("type") or "")
    direction = -1.0 if condition.get("operator") in {"lt", "lte"} else 1.0
    scaled = weight * direction
    if condition_type in {"tag_count", "tag_is_highest"}:
        profile["tags"][str(condition.get("tag") or "")] += scaled
    elif condition_type == "tag_compare":
        profile["tags"][str(condition.get("left") or "")] += scaled
        profile["tags"][str(condition.get("right") or "")] -= scaled
    elif condition_type == "tag_sum_compare":
        for tag_id in condition.get("left_tags", []):
            profile["tags"][str(tag_id)] += scaled / max(1, len(condition.get("left_tags", [])))
        for tag_id in condition.get("right_tags", []):
            profile["tags"][str(tag_id)] -= scaled / max(1, len(condition.get("right_tags", [])))
    elif condition_type in {"production", "capacity"}:
        profile["resources"][str(condition.get("resource") or "")] += scaled
    elif condition_type == "collapsed_pillar":
        profile["pillars"][str(condition.get("pillar") or "")] -= weight
    elif condition_type in {"not_collapsed_pillar", "highest_surviving_pillar"}:
        profile["pillars"][str(condition.get("pillar") or "")] += weight
    elif condition_type == "token_count":
        profile["tokens"][_token_id(str(condition.get("token") or ""))] += scaled
    elif condition_type == "tag_plus_token_count":
        profile["tags"][str(condition.get("tag") or "")] += scaled * 0.5
        profile["tokens"][_token_id(str(condition.get("token") or ""))] += scaled * 0.5
    elif condition_type == "no_city_has_plague_exceeding_sanitary":
        profile["tags"]["sanitary"] += weight
        profile["tokens"]["plague-token"] -= weight
    elif condition_type == "distinct_tags_at_least":
        for tag_id in condition.get("tags", []):
            profile["tags"][str(tag_id)] += weight / max(1, len(condition.get("tags", [])))
    elif condition_type == "all_tags_at_most":
        for tag_id in condition.get("tags", []):
            profile["tags"][str(tag_id)] -= weight / max(1, len(condition.get("tags", [])))


def _agenda_potential(state: dict[str, Any], agenda_id: str) -> float:
    agenda = next(
        (entry for entry in state.get("catalog", {}).get("agendas", []) if entry.get("id") == agenda_id),
        None,
    )
    if not agenda:
        return float("-inf")
    data = agenda.get("data") or {}
    value = 0.0
    for section_name, weight in (("primary", 4.0), ("secondary", 2.0), ("collapse", 1.0)):
        conditions = (data.get(section_name) or {}).get("conditions") or []
        if conditions:
            value += weight * sum(_condition_progress(state, condition) for condition in conditions) / len(conditions)
    forbidden = (data.get("forbidden") or {}).get("conditions") or []
    if forbidden:
        value += 3.0 * (1.0 - sum(_condition_progress(state, condition) for condition in forbidden) / len(forbidden))
    return value


def _condition_progress(state: dict[str, Any], condition: dict[str, Any]) -> float:
    if _agenda_condition_met(state, condition):
        return 1.0
    condition_type = str(condition.get("type") or "")
    amount = max(1, int(condition.get("amount") or 1))
    if condition_type == "tag_count":
        return min(1.0, int(_empire_tag_counts(state).get(str(condition.get("tag") or ""), 0)) / amount)
    if condition_type in {"production", "capacity"}:
        resource_id = str(condition.get("resource") or "")
        current = int(_production_counts(state).get(resource_id, 0))
        if condition_type == "capacity":
            current += int(_counts(state.get("stored_resources")).get(resource_id, 0))
        return min(1.0, current / amount)
    if condition_type in {"collapsed_pillar", "not_collapsed_pillar", "highest_surviving_pillar"}:
        return 0.35
    if condition_type in {"token_count", "tag_plus_token_count"}:
        return 0.25
    return 0.2


def _item_playable_now(state: dict[str, Any], item: dict[str, Any]) -> bool:
    if _is_event(item):
        return True
    return _can_pay_cost(state, item) and bool(_legal_placements(state, item))


def _readiness_turns(state: dict[str, Any], item: dict[str, Any]) -> int:
    if _item_playable_now(state, item):
        return 0
    data = item.get("data") or {}
    if _is_event(item):
        requirements = data.get("requirements") or []
        tag_requirements = {
            str(requirement.get("item_id") or ""): int(requirement.get("amount", 1))
            for requirement in requirements
            if requirement.get("type") == "tag"
        }
        resource_requirements = {
            str(requirement.get("item_id") or ""): int(requirement.get("amount", 1))
            for requirement in requirements
            if requirement.get("type") == "resource"
        }
        if any(requirement.get("type") == "pillar" for requirement in requirements):
            return 2
        return _requirements_readiness(state, tag_requirements, resource_requirements, use_global_tags=True)
    required_tags = _counts(data.get("required_tags"))
    if _is_city_card(item):
        tag_steps = _tag_readiness(state, _empire_tag_counts(state), required_tags)
    else:
        city_steps = [
            _tag_readiness(state, _city_tag_counts(state, city), required_tags)
            for city in state.get("cities", [])
        ]
        tag_steps = min(city_steps, default=99)
    resource_steps = _resource_readiness(state, _counts(data.get("cost")))
    slot_steps = 0
    if not _is_city_card(item) and all(
        len(city.get("cards", [])) >= int(city.get("building_slots", 0))
        for city in state.get("cities", [])
    ):
        slot_steps = 1 if any(
            _is_city_card(card)
            or any(effect.get("effect_type") == "add_building_slots" for effect in (card.get("data") or {}).get("persistent_effects", []))
            for card in state.get("catalog", {}).get("cards", [])
        ) else 99
    return max(tag_steps, resource_steps, slot_steps)


def _requirements_readiness(
    state: dict[str, Any],
    tag_requirements: dict[str, int],
    resource_requirements: dict[str, int],
    *,
    use_global_tags: bool,
) -> int:
    tags = _empire_tag_counts(state) if use_global_tags else {}
    return max(
        _tag_readiness(state, tags, tag_requirements),
        _resource_readiness(state, resource_requirements),
    )


def _tag_readiness(
    state: dict[str, Any],
    current_tags: dict[str, int],
    required_tags: dict[str, int],
) -> int:
    missing = {
        tag_id: max(0, amount - int(current_tags.get(tag_id, 0)))
        for tag_id, amount in required_tags.items()
    }
    steps = 0
    for tag_id, amount in missing.items():
        if amount <= 0:
            continue
        providers = [
            card
            for card in state.get("catalog", {}).get("cards", [])
            if int(_counts((card.get("data") or {}).get("tags")).get(tag_id, 0)) > 0
        ]
        if not providers:
            return 99
        best_output = max(
            int(_counts((provider.get("data") or {}).get("tags")).get(tag_id, 0))
            for provider in providers
        )
        steps += math.ceil(amount / max(1, best_output))
    return steps


def _resource_readiness(state: dict[str, Any], costs: dict[str, int]) -> int:
    pool = _counts(state.get("global_resource_pool"))
    production = _production_counts(state)
    generic_storage, specific_storage = _storage_capacity(state)
    turns = 0
    for resource_id, amount in costs.items():
        shortfall = max(0, amount - int(pool.get(resource_id, 0)))
        if shortfall <= 0:
            continue
        per_era = int(production.get(resource_id, 0))
        capacity = generic_storage + int(specific_storage.get(resource_id, 0))
        if per_era > 0 and (amount <= per_era or capacity > 0):
            turns = max(turns, math.ceil(shortfall / per_era))
            continue
        providers = [
            card
            for card in state.get("catalog", {}).get("cards", [])
            if int(_counts((card.get("data") or {}).get("production")).get(resource_id, 0)) > 0
        ]
        if not providers:
            return 99
        turns = max(turns, 2)
    return turns


def _minister_control_value(
    state: dict[str, Any],
    item: dict[str, Any],
    player_id: str,
    eras_ahead: int,
) -> float:
    roles = _decision_roles(state, item)
    if not roles:
        return 0.0
    controlled = sum(
        _forecast_role_holder(state, role, eras_ahead) == player_id
        for role in roles
    )
    return controlled * MINISTER_CONTROL_BONUS / (eras_ahead + 1)


def _decision_roles(state: dict[str, Any], item: dict[str, Any]) -> set[str]:
    if not _is_event(item):
        return {"cities"}
    data = item.get("data") or {}
    ministry_id = str(data.get("ministry_id") or "")
    if ministry_id:
        ministry = next(
            (entry for entry in state.get("catalog", {}).get("ministries", []) if entry.get("id") == ministry_id),
            None,
        )
        role = _ministry_role(ministry) if ministry else ""
        return {role} if role else {"empire"}
    roles: set[str] = set()
    for effect in [*data.get("main_effects", []), *data.get("alternative_effects", [])]:
        effect_type = str(effect.get("effect_type") or "")
        if effect_type in {"modify_resources", "convert_resources", "modify_plague"}:
            roles.add("health")
        elif effect_type in {"destroy_building", "modify_fortified"}:
            roles.add("war")
        elif effect_type == "modify_unrest":
            roles.add("state")
        elif effect_type in {"modify_city_tokens", "draw_card"}:
            roles.add("empire")
    return roles


def _forecast_role_holder(state: dict[str, Any], role: str, eras_ahead: int) -> str:
    players = state.get("players", [])
    if not players:
        return ""
    if eras_ahead <= 0:
        return (
            str(state.get("minister_of_empire_player_id") or "")
            if role == "empire"
            else _ministry_holder(state, role)
        )
    if role == "empire":
        current = next(
            (index for index, player in enumerate(players) if player["id"] == state.get("minister_of_empire_player_id")),
            0,
        )
        return players[(current + eras_ahead) % len(players)]["id"]
    ministry = next(
        (
            entry
            for entry in state.get("catalog", {}).get("ministries", [])
            if _is_ministry(entry, role)
        ),
        None,
    )
    if ministry is None:
        return _forecast_role_holder(state, "empire", eras_ahead)
    future_empire = _forecast_role_holder(state, "empire", eras_ahead)
    empire_index = next(
        index for index, player in enumerate(players) if player["id"] == future_empire
    )
    return players[
        (empire_index + _ministry_role_offset(len(players), role)) % len(players)
    ]["id"]


def _ministry_role(ministry: dict[str, Any] | None) -> str:
    for role in ("empire", *MINISTRY_ROTATION_ORDER):
        if ministry and _is_ministry(ministry, role):
            return role
    return ""


def _resource_value(state: dict[str, Any], player_id: str, resource_id: str) -> float:
    profile = _agenda_profile(state, player_id)
    return RESOURCE_VALUES.get(resource_id, 1.0) + profile["resources"].get(resource_id, 0.0)


def _production_counts(state: dict[str, Any]) -> Counter:
    production: Counter = Counter()
    for city in state.get("cities", []):
        for card_id in [city.get("city_card_id"), *city.get("cards", [])]:
            if card_id:
                production.update(_production_for_card(item_by_id(state, card_id)))
    return production


def _all_token_counts(state: dict[str, Any]) -> Counter:
    tokens = Counter(_counts(state.get("condition_tokens")))
    for city in state.get("cities", []):
        tokens.update(_counts(city.get("condition_tokens")))
    return tokens


def _volatile_resources(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        entry
        for entry in state.get("catalog", {}).get("tags", [])
        if (entry.get("data") or {}).get("resource_type") == "volatile"
    ]


def _agenda_for_player(state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
    agenda_id = str(_player(state, player_id).get("hidden_agenda_id") or "")
    return next(
        (entry for entry in state.get("catalog", {}).get("agendas", []) if entry.get("id") == agenda_id),
        None,
    )


def _token_id(token_name: str) -> str:
    normalized = token_name.replace("_", "-")
    if normalized == "global-unrest":
        return "unrest-token"
    return normalized if normalized.endswith("-token") else f"{normalized}-token"


def _player(state: dict[str, Any], player_id: str) -> dict[str, Any]:
    player = next(
        (entry for entry in state.get("players", []) if entry.get("id") == player_id),
        None,
    )
    if player is None:
        raise ValueError("Player not found.")
    return player


def _stable_action_key(action: dict[str, Any]) -> str:
    return json.dumps(action, sort_keys=True, separators=(",", ":"))
