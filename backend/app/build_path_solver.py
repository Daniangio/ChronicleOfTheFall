from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class BuildPath:
    building_card_ids: tuple[str, ...]


@dataclass(frozen=True)
class BuildPathResult:
    city_card_id: str
    target_card_id: str
    minimum_buildings: int | None
    paths: tuple[BuildPath, ...]


def find_build_distances(
    cards: Iterable[dict[str, Any]],
    *,
    starting_resource_ids: Iterable[str],
    starting_tags: dict[str, int],
    max_buildings: int = 3,
    excluded_card_ids: Iterable[str] = (),
) -> dict[str, int]:
    """Return the fewest prerequisite Structures needed before each card is buildable."""
    structures = sorted(
        (
            card
            for card in cards
            if isinstance(card, dict)
            and card.get("category") == "structure"
            and str(card.get("id") or "")
        ),
        key=lambda card: str(card["id"]),
    )
    excluded = {str(card_id) for card_id in excluded_card_ids}
    tag_caps: dict[str, int] = {}
    for card in structures:
        for tag_id, count in _requirements(card)[1].items():
            tag_caps[tag_id] = max(tag_caps.get(tag_id, 0), count)

    initial_resources = frozenset(str(resource_id) for resource_id in starting_resource_ids if resource_id)
    initial_tags = dict(_tag_state(_positive_counts(starting_tags), tag_caps))
    frontier: list[tuple[frozenset[str], dict[str, int]]] = [(initial_resources, initial_tags)]
    seen = {(initial_resources, _tag_state(initial_tags, tag_caps))}
    distances: dict[str, int] = {}

    for depth in range(max(0, int(max_buildings)) + 1):
        next_frontier: list[tuple[frozenset[str], dict[str, int]]] = []
        for resources, tags in frontier:
            buildable = [card for card in structures if _can_build(card, resources, tags)]
            for card in buildable:
                distances.setdefault(str(card["id"]), depth)
            if depth >= max_buildings:
                continue
            for card in buildable:
                if str(card["id"]) in excluded:
                    continue
                contributed_resources, contributed_tags = _contributions(card)
                next_resources = resources | contributed_resources
                uncapped_tags = Counter(tags)
                uncapped_tags.update(contributed_tags)
                next_tags = dict(_tag_state(dict(uncapped_tags), tag_caps))
                if next_resources == resources and next_tags == tags:
                    continue
                state_key = (next_resources, _tag_state(next_tags, tag_caps))
                if state_key in seen:
                    continue
                seen.add(state_key)
                next_frontier.append((next_resources, next_tags))
        frontier = next_frontier
        if not frontier:
            break
    return distances


def _positive_counts(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, int] = {}
    for raw_key, raw_count in value.items():
        key = str(raw_key or "").strip()
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            continue
        if key and count > 0:
            result[key] = count
    return result


def _card_data(card: dict[str, Any]) -> dict[str, Any]:
    data = card.get("data")
    return data if isinstance(data, dict) else {}


def _requirements(card: dict[str, Any]) -> tuple[frozenset[str], dict[str, int]]:
    data = _card_data(card)
    return frozenset(_positive_counts(data.get("cost"))), _positive_counts(data.get("required_tags"))


def _contributions(card: dict[str, Any]) -> tuple[frozenset[str], dict[str, int]]:
    data = _card_data(card)
    return frozenset(_positive_counts(data.get("production"))), _positive_counts(data.get("tags"))


def _can_build(
    card: dict[str, Any],
    resources: frozenset[str],
    tags: dict[str, int],
) -> bool:
    required_resources, required_tags = _requirements(card)
    return required_resources.issubset(resources) and all(
        tags.get(tag_id, 0) >= count for tag_id, count in required_tags.items()
    )


def _tag_state(tags: dict[str, int], caps: dict[str, int]) -> tuple[tuple[str, int], ...]:
    return tuple(
        (tag_id, min(tags.get(tag_id, 0), cap))
        for tag_id, cap in sorted(caps.items())
        if min(tags.get(tag_id, 0), cap) > 0
    )


def find_minimal_build_paths(
    cards: Iterable[dict[str, Any]],
    *,
    city_card_id: str,
    target_card_id: str,
) -> BuildPathResult:
    card_by_id = {
        str(card.get("id") or ""): card
        for card in cards
        if isinstance(card, dict) and str(card.get("id") or "")
    }
    city = card_by_id.get(city_card_id)
    target = card_by_id.get(target_card_id)
    if city is None or city.get("category") != "city":
        raise ValueError("Starting card must be an existing city card.")
    if target is None or target.get("category") != "structure":
        raise ValueError("Target card must be an existing structure card.")

    structures = sorted(
        (
            card
            for card in card_by_id.values()
            if card.get("category") == "structure" and card.get("id") != target_card_id
        ),
        key=lambda card: str(card["id"]),
    )
    tag_caps: dict[str, int] = {}
    for card in [*structures, target]:
        for tag_id, count in _requirements(card)[1].items():
            tag_caps[tag_id] = max(tag_caps.get(tag_id, 0), count)

    initial_resources, initial_tags = _contributions(city)
    initial_tag_counts = dict(_tag_state(initial_tags, tag_caps))
    if _can_build(target, initial_resources, initial_tag_counts):
        return BuildPathResult(
            city_card_id=city_card_id,
            target_card_id=target_card_id,
            minimum_buildings=0,
            paths=(BuildPath(building_card_ids=()),),
        )

    # Each frontier item retains one valid construction order. The canonical
    # multiset removes paths that differ only by the order of the same cards.
    frontier: list[tuple[frozenset[str], dict[str, int], tuple[str, ...]]] = [
        (initial_resources, initial_tag_counts, ())
    ]
    seen_multisets: set[tuple[str, ...]] = {()}

    while frontier:
        next_frontier: list[tuple[frozenset[str], dict[str, int], tuple[str, ...]]] = []
        solutions: dict[tuple[str, ...], tuple[str, ...]] = {}
        for resources, tags, path in frontier:
            for structure in structures:
                if not _can_build(structure, resources, tags):
                    continue
                contributed_resources, contributed_tags = _contributions(structure)
                next_resources = resources | contributed_resources
                uncapped_tags = Counter(tags)
                uncapped_tags.update(contributed_tags)
                next_tags = dict(_tag_state(dict(uncapped_tags), tag_caps))
                if next_resources == resources and next_tags == tags:
                    continue

                next_path = (*path, str(structure["id"]))
                canonical_path = tuple(sorted(next_path))
                if canonical_path in seen_multisets:
                    continue
                seen_multisets.add(canonical_path)

                if _can_build(target, next_resources, next_tags):
                    solutions.setdefault(canonical_path, next_path)
                else:
                    next_frontier.append((next_resources, next_tags, next_path))

        if solutions:
            ordered = tuple(
                BuildPath(building_card_ids=solutions[key])
                for key in sorted(solutions)
            )
            return BuildPathResult(
                city_card_id=city_card_id,
                target_card_id=target_card_id,
                minimum_buildings=len(ordered[0].building_card_ids),
                paths=ordered,
            )
        frontier = next_frontier

    return BuildPathResult(
        city_card_id=city_card_id,
        target_card_id=target_card_id,
        minimum_buildings=None,
        paths=(),
    )
