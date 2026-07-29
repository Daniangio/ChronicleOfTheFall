from __future__ import annotations

from backend.app.build_path_solver import find_minimal_build_paths


def card(
    card_id: str,
    *,
    category: str = "structure",
    cost: dict[str, int] | None = None,
    required_tags: dict[str, int] | None = None,
    production: dict[str, int] | None = None,
    tags: dict[str, int] | None = None,
) -> dict:
    return {
        "id": card_id,
        "category": category,
        "data": {
            "cost": cost or {},
            "required_tags": required_tags or {},
            "production": production or {},
            "tags": tags or {},
        },
    }


def test_resource_quantity_is_satisfied_by_any_positive_production():
    cards = [
        card("capital", category="city", production={"labor": 1}),
        card("market", cost={"labor": 1}, production={"favor": 1}),
        card("palace", cost={"favor": 2}),
    ]

    result = find_minimal_build_paths(
        cards,
        city_card_id="capital",
        target_card_id="palace",
    )

    assert result.minimum_buildings == 1
    assert [path.building_card_ids for path in result.paths] == [("market",)]


def test_resource_producers_are_discovered_through_multiple_build_steps():
    cards = [
        card("capital", category="city", production={"labor": 2}),
        card("farm", cost={"labor": 1}, production={"food": 1}),
        card("brewery", cost={"labor": 1, "food": 3}, production={"wealth": 1}),
        card("manor", cost={"wealth": 2}),
    ]

    result = find_minimal_build_paths(
        cards,
        city_card_id="capital",
        target_card_id="manor",
    )

    assert result.minimum_buildings == 2
    assert [path.building_card_ids for path in result.paths] == [("farm", "brewery")]


def test_only_minimal_alternatives_are_returned():
    cards = [
        card("capital", category="city", production={"labor": 1}),
        card("market", cost={"labor": 1}, production={"favor": 1}),
        card("court", cost={"labor": 1}, production={"favor": 1}),
        card("mine", cost={"labor": 1}, production={"material": 1}),
        card("long-route", cost={"material": 1}, production={"favor": 1}),
        card("palace", cost={"favor": 1}),
    ]

    result = find_minimal_build_paths(
        cards,
        city_card_id="capital",
        target_card_id="palace",
    )

    assert result.minimum_buildings == 1
    assert {path.building_card_ids for path in result.paths} == {
        ("court",),
        ("market",),
    }


def test_same_buildings_in_different_orders_form_one_path():
    cards = [
        card("capital", category="city", production={"labor": 1}),
        card("chapel", cost={"labor": 1}, tags={"faith": 1}),
        card("workshop", cost={"labor": 1}, tags={"industry": 1}),
        card(
            "cathedral",
            required_tags={"faith": 1, "industry": 1},
        ),
    ]

    result = find_minimal_build_paths(
        cards,
        city_card_id="capital",
        target_card_id="cathedral",
    )

    assert result.minimum_buildings == 2
    assert len(result.paths) == 1
    assert set(result.paths[0].building_card_ids) == {"chapel", "workshop"}


def test_repeated_structure_copies_can_satisfy_tag_counts():
    cards = [
        card("capital", category="city", production={"labor": 1}),
        card("chapel", cost={"labor": 1}, tags={"faith": 1}),
        card("cathedral", required_tags={"faith": 2}),
    ]

    result = find_minimal_build_paths(
        cards,
        city_card_id="capital",
        target_card_id="cathedral",
    )

    assert result.minimum_buildings == 2
    assert result.paths[0].building_card_ids == ("chapel", "chapel")
