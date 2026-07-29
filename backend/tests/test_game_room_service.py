from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.app.game_router import _deck_item_ids, _deck_setup_ids
from backend.app.game_room_service import GameRoomService, ROOM_STATE_FINISHED, ROOM_STATE_IN_GAME
from backend.app.goldfishing_engine import (
    _agenda_condition_met,
    _apply_on_build_effects,
    _assign_ministries,
    _end_era,
    _plotting_resolution_preview,
    build_goldfishing_state,
    perform_action,
)
from backend.app.server_models import User


def test_deck_setup_tiers_mark_copies_without_changing_deck_contents():
    deck = SimpleNamespace(
        data={
            "item_ids": ["a", "b", "c", "d"],
            "initial_setup": {
                "3": ["a"] * 6,
                "4": ["b"] * 2,
                "5": ["c"] * 2,
            },
        }
    )

    assert _deck_item_ids(deck) == ["a", "b", "c", "d"]
    assert _deck_setup_ids(deck, player_count=3) == ["a"] * 6
    assert _deck_setup_ids(deck, player_count=4) == [*(["a"] * 6), *(["b"] * 2)]
    assert _deck_setup_ids(deck, player_count=5) == [*(["a"] * 6), *(["b"] * 2), *(["c"] * 2)]


def catalog_entry(entry_id: str, name: str, kind: str, *, category: str = "", data: dict | None = None) -> dict:
    return {
        "id": entry_id,
        "name": name,
        "kind": kind,
        "category": category,
        "summary": "",
        "color": None,
        "data": data or {},
    }

TEST_AGENDA_DATA = {
    "max_points": 8,
    "win_threshold": 6,
    "primary_mandatory": True,
    "forbidden_is_veto": True,
    "primary": {
        "name": "Urban Legacy",
        "points": 4,
        "text": "Urban is present.",
        "conditions": [{"type": "tag_count", "tag": "urban", "operator": "gte", "amount": 1}],
    },
    "secondary": {
        "name": "Labor Base",
        "points": 2,
        "text": "Labor production is present.",
        "conditions": [{"type": "production", "resource": "labor", "operator": "gte", "amount": 1}],
    },
    "collapse": {
        "name": "Morale Falls",
        "points": 2,
        "text": "Morale collapses.",
        "conditions": [{"type": "collapsed_pillar", "pillar": "pillar-of-morale"}],
    },
    "forbidden": {
        "name": "No Science Supremacy",
        "points": 0,
        "text": "Science is not highest.",
        "conditions": [{"type": "tag_is_highest", "tag": "science"}],
    },
}


MINISTRIES = [
    catalog_entry("minister-of-the-empire", "Minister of the Empire", "ministries", data={"is_minister_of_empire": True}),
    catalog_entry("minister-of-cities", "Minister of Cities", "ministries"),
    catalog_entry("minister-of-state", "Minister of State", "ministries"),
    catalog_entry("minister-of-health-harvest", "Minister of Health & Harvest", "ministries"),
    catalog_entry("minister-of-war", "Minister of War", "ministries"),
]

TAGS = [
    catalog_entry("urban", "Urban", "tags", category="permanent", data={"resource_type": "permanent"}),
    catalog_entry("food", "Food", "tags", category="permanent", data={"resource_type": "permanent"}),
    catalog_entry("military", "Military", "tags", category="permanent", data={"resource_type": "permanent"}),
    catalog_entry("labor", "Labor", "tags", category="volatile", data={"resource_type": "volatile"}),
    catalog_entry("wealth", "Wealth", "tags", category="volatile", data={"resource_type": "volatile"}),
]

PILLARS = [
    catalog_entry("treasury", "Treasury", "pillars", data={"min": 0, "max": 10, "start": 5}),
    catalog_entry("stability", "Stability", "pillars", data={"min": 0, "max": 10, "start": 5}),
    catalog_entry("morale", "Morale", "pillars", data={"min": 0, "max": 10, "start": 5}),
]

CARDS = [
    catalog_entry(
        "capital",
        "Capital",
        "cards",
        category="city",
        data={
            "building_slots": 4,
            "tags": {"urban": 1},
            "production": {"labor": 2, "wealth": 1},
            "persistent_effects": [{"effect_type": "storage", "payload": {"amount": 2}}],
        },
    ),
    catalog_entry(
        "farm",
        "Farm",
        "cards",
        category="structure",
        data={
            "cost": {"labor": 1},
            "tags": {"food": 1},
            "production": {"labor": 1},
            "on_build_effects": [
                {"effect_type": "modify_pillar", "payload": {"pillar_id": "morale", "amount": 1}}
            ],
        },
    ),
    catalog_entry(
        "garrison",
        "Garrison",
        "cards",
        category="structure",
        data={"cost": {"labor": 1}, "tags": {"military": 1}},
    ),
]

EVENTS = [
    catalog_entry(
        "tax-riots",
        "Tax Riots",
        "events",
        data={
            "subtype": "edict",
            "requirements": [
                {"type": "pillar", "pillar_id": "morale", "operator": "lte", "value": 4}
            ],
            "main_effects": [
                {"effect_type": "modify_pillar", "payload": {"pillar_id": "stability", "amount": -1}}
            ],
            "alternative_effects": [
                {"effect_type": "modify_pillar", "payload": {"pillar_id": "treasury", "amount": -1}}
            ],
        },
    ),
    catalog_entry(
        "border-raid",
        "Border Raid",
        "events",
        data={
            "subtype": "crisis",
            "requirements": [{"type": "tag", "item_id": "military", "amount": 2}],
            "main_effects": [{"effect_type": "modify_pillar", "payload": {"pillar_id": "treasury", "amount": 1}}],
            "alternative_effects": [{"effect_type": "modify_pillar", "payload": {"pillar_id": "stability", "amount": -1}}],
        },
    ),
]


def build_state(**overrides) -> dict:
    setup_pool_ids = ["farm", "garrison"] * 4
    arguments = {
        "room_id": "test-room",
        "card_entries": CARDS,
        "tag_entries": TAGS,
        "empire_deck_ids": [*setup_pool_ids, *(["farm", "garrison", "tax-riots"] * 12)],
        "crisis_deck_ids": ["border-raid"] * 12,
        "setup_pool_ids": setup_pool_ids,
        "empire_deck_id": "empire-deck",
        "crisis_deck_id": "crisis-deck",
        "initial_city_card_id": "capital",
        "suspicion_start_era": 1,
        "event_entries": EVENTS,
        "ministry_entries": MINISTRIES,
        "pillar_entries": PILLARS,
        "agenda_entries": [
            catalog_entry(
                "survivor",
                "Survivor",
                "agendas",
                data=TEST_AGENDA_DATA,
            )
        ] * 10,
    }
    arguments.update(overrides)
    auto_choose_agendas = arguments.pop("auto_choose_agendas", True)
    state = build_goldfishing_state(**arguments)
    while auto_choose_agendas and state["phase"] == "agenda_selection":
        action = state["possible_actions"][0]
        state = perform_action(state, action["type"], action)
    return state


def finish_ministry_draft(state: dict) -> dict:
    return state


class TestAnonymousCouncilEngine(unittest.TestCase):
    def test_plotting_preview_uses_full_current_resources_and_tags(self):
        state = build_state()
        farm = next(card for card in state["catalog"]["cards"] if card["id"] == "farm")
        edict = next(event for event in state["catalog"]["events"] if event["id"] == "tax-riots")
        crisis = next(event for event in state["catalog"]["events"] if event["id"] == "border-raid")

        state["global_resource_pool"] = {"labor": 1}
        state["pillars"]["morale"] = 4
        self.assertEqual(_plotting_resolution_preview(state, farm), "success")
        self.assertEqual(_plotting_resolution_preview(state, edict), "success")
        self.assertEqual(_plotting_resolution_preview(state, crisis), "failure")

        state["global_resource_pool"] = {}
        state["pillars"]["morale"] = 5
        self.assertEqual(_plotting_resolution_preview(state, farm), "unresolved")
        self.assertEqual(_plotting_resolution_preview(state, edict), "unresolved")

    def test_agenda_condition_vocabulary_uses_final_empire_state(self):
        state = build_state()
        capital = next(card for card in state["catalog"]["cards"] if card["id"] == "capital")
        capital["data"]["tags"] = {
            "culture": 2,
            "military": 2,
            "science": 1,
            "sanitary": 2,
        }
        capital["data"]["production"] = {"labor": 3, "knowledge": 1}
        state["stored_resources"] = {"knowledge": 1}
        state["pillars"] = {"treasury": 5, "stability": 4, "morale": 0}
        state["cities"][0]["condition_tokens"] = {
            "plague-token": 2,
            "fortified-token": 1,
        }

        conditions = [
            {"type": "tag_count", "tag": "culture", "operator": "gte", "amount": 2},
            {"type": "tag_compare", "left": "culture", "operator": "gt", "right": "science"},
            {
                "type": "tag_sum_compare",
                "left_tags": ["culture", "military"],
                "operator": "gt",
                "right_tags": ["science", "sanitary"],
            },
            {"type": "production", "resource": "labor", "operator": "gte", "amount": 3},
            {"type": "capacity", "resource": "knowledge", "operator": "gte", "amount": 2},
            {"type": "collapsed_pillar", "pillar": "morale"},
            {"type": "not_collapsed_pillar", "pillar": "treasury"},
            {"type": "highest_surviving_pillar", "pillar": "treasury"},
            {"type": "token_count", "token": "plague", "scope": "empire", "operator": "eq", "amount": 2},
            {
                "type": "tag_plus_token_count",
                "tag": "military",
                "token": "fortified",
                "scope": "empire",
                "operator": "gte",
                "amount": 3,
            },
            {"type": "no_city_has_plague_exceeding_sanitary"},
            {
                "type": "distinct_tags_at_least",
                "tags": ["culture", "military", "science"],
                "minimum_distinct": 3,
                "minimum_each": 1,
            },
            {"type": "all_tags_at_most", "tags": ["culture", "military", "science"], "amount": 2},
            {"type": "tag_is_highest", "tag": "culture"},
        ]

        self.assertTrue(all(_agenda_condition_met(state, condition) for condition in conditions))

    def test_on_build_effects_add_and_remove_city_tokens(self):
        state = build_state()
        city = state["cities"][0]
        card = catalog_entry(
            "quarantine",
            "Quarantine",
            "cards",
            category="structure",
            data={
                "on_build_effects": [
                    {"effect_type": "modify_token", "payload": {"token_id": "plague-token", "amount": 2}},
                    {"effect_type": "modify_token", "payload": {"token_id": "unrest-token", "amount": 1}},
                ]
            },
        )

        _apply_on_build_effects(state, card, city)
        self.assertEqual(city["condition_tokens"], {"plague-token": 2, "unrest-token": 1})

        card["data"]["on_build_effects"] = [
            {"effect_type": "modify_token", "payload": {"token_id": "plague-token", "amount": -3}},
            {"effect_type": "modify_token", "payload": {"token_id": "unrest-token", "amount": -1}},
        ]
        _apply_on_build_effects(state, card, city)
        self.assertEqual(city["condition_tokens"], {})

    def test_setup_deals_base_and_empire_cards_and_places_initial_city(self):
        state = build_state()

        self.assertEqual(state["phase"], "suspicion")
        self.assertEqual(state["rules_version"], "anonymous-council")
        self.assertEqual(state["cities"][0]["city_card_id"], "capital")
        self.assertEqual(state["cities"][0]["building_slots"], 4)
        state_player_id = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "state" in ministry_id
        )
        self.assertTrue(
            all(
                len(player["hand"]) == (5 if player["id"] == state_player_id else 4)
                for player in state["players"]
            )
        )
        self.assertTrue(all(player["hand"].count("border-raid") == 1 for player in state["players"]))
        self.assertNotIn("border-raid", state["empire_deck"])
        self.assertTrue(all(len(player["scheme_slots"]) == 2 for player in state["players"]))
        self.assertEqual(state["pillars"], {"treasury": 5, "stability": 5, "morale": 5})

    def test_suspicion_is_skipped_until_the_level_start_era(self):
        state = build_state(suspicion_start_era=5)

        self.assertEqual(state["phase"], "plotting")
        self.assertEqual(state["global_resource_pool"], {"labor": 2, "wealth": 1})
        self.assertEqual(
            {action["player_id"] for action in state["possible_actions"]},
            {player["id"] for player in state["players"]},
        )
        self.assertEqual(state["suspicion_start_era"], 5)

    def test_players_choose_one_of_two_hidden_agendas_in_parallel(self):
        state = build_state(auto_choose_agendas=False)

        self.assertEqual(state["phase"], "agenda_selection")
        self.assertTrue(all(len(player["agenda_options"]) == 2 for player in state["players"]))
        player_three_action = next(
            action
            for action in state["possible_actions"]
            if action["player_id"] == "player-3"
        )
        state = perform_action(state, "choose_agenda", player_three_action)

        player_three = next(player for player in state["players"] if player["id"] == "player-3")
        self.assertEqual(player_three["hidden_agenda_id"], player_three_action["agenda_id"])
        self.assertEqual(player_three["agenda_options"], [])
        self.assertEqual(state["sealed_agenda_count"], 1)
        self.assertEqual(state["phase"], "agenda_selection")

    def test_goldfishing_plotting_accepts_any_uncommitted_player(self):
        state = build_state(suspicion_start_era=5)
        player_id = "player-3"
        action = next(
            entry
            for entry in state["possible_actions"]
            if entry["type"] == "select_commit_card" and entry["player_id"] == player_id
        )
        self.assertIn(action["resolution_preview"], {"success", "failure", "unresolved"})

        state = perform_action(state, action["type"], action)

        player = next(player for player in state["players"] if player["id"] == player_id)
        self.assertFalse(player["committed"])
        self.assertEqual(player["selected_commitment"]["item_id"], action["item_id"])
        confirm = next(
            entry
            for entry in state["possible_actions"]
            if entry["type"] == "confirm_plotting" and entry["player_id"] == player_id
        )
        state = perform_action(state, confirm["type"], confirm)

        self.assertTrue(next(player for player in state["players"] if player["id"] == player_id)["committed"])
        self.assertEqual(state["phase"], "plotting")
        self.assertNotIn(player_id, {entry.get("player_id") for entry in state["possible_actions"]})
        self.assertEqual(
            {entry.get("player_id") for entry in state["possible_actions"]},
            {"player-1", "player-2", "player-4"},
        )

    def test_ministries_auto_assign_in_order_and_state_rotates_to_war(self):
        state = build_state()
        state_holder = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "state" in ministry_id
        )
        war_holder = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "war" in ministry_id
        )
        self.assertNotEqual(state_holder, war_holder)
        self.assertEqual(len(state["ministry_assignments"]), 5)
        self.assertEqual(state["players"][0]["ministry_ids"], ["minister-of-the-empire"])

        state["era"] = 2
        _assign_ministries(state, rotate=True)
        next_war_holder = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "war" in ministry_id
        )
        self.assertEqual(next_war_holder, state_holder)

    def test_three_players_assign_all_ministries_without_combining_state_and_war(self):
        state = build_state()
        state["players"] = state["players"][:3]
        state["minister_of_empire_player_id"] = "player-1"

        _assign_ministries(state, rotate=False)

        non_empire_assignments = {
            ministry_id: holder
            for ministry_id, holder in state["ministry_assignments"].items()
            if "empire" not in ministry_id
        }
        state_holder = next(holder for ministry_id, holder in non_empire_assignments.items() if "state" in ministry_id)
        war_holder = next(holder for ministry_id, holder in non_empire_assignments.items() if "war" in ministry_id)
        self.assertEqual(len(non_empire_assignments), 4)
        self.assertNotEqual(state_holder, war_holder)
        self.assertEqual(set(non_empire_assignments.values()), {"player-2", "player-3"})
        self.assertEqual(
            {
                ministry_id
                for ministry_id, holder in non_empire_assignments.items()
                if holder == "player-2"
            },
            {"minister-of-cities", "minister-of-war"},
        )
        self.assertEqual(
            {
                ministry_id
                for ministry_id, holder in non_empire_assignments.items()
                if holder == "player-3"
            },
            {"minister-of-state", "minister-of-health-harvest"},
        )
        empire_player = next(player for player in state["players"] if player["id"] == "player-1")
        self.assertEqual(empire_player["ministry_ids"], ["minister-of-the-empire"])

    def test_five_players_keep_empire_separate_and_assign_one_ministry_each(self):
        state = build_state(player_count=5)

        self.assertEqual(
            state["ministry_assignments"],
            {
                "minister-of-the-empire": "player-1",
                "minister-of-cities": "player-4",
                "minister-of-state": "player-3",
                "minister-of-war": "player-2",
                "minister-of-health-harvest": "player-5",
            },
        )
        self.assertEqual(state["players"][0]["ministry_ids"], ["minister-of-the-empire"])

    def test_two_suspicion_deposes_and_blocks_events_with_three_players(self):
        state = build_state()
        state["players"] = state["players"][:3]
        state["minister_of_empire_player_id"] = "player-1"
        _assign_ministries(state, rotate=False)

        for target in ("player-2", "", "player-2"):
            action = next(
                entry for entry in state["possible_actions"]
                if entry["target_player_id"] == target
            )
            state = perform_action(state, "place_suspicion", action)

        player_two = next(player for player in state["players"] if player["id"] == "player-2")
        self.assertEqual(player_two["suspicion"], 2)
        self.assertFalse(player_two["hand_revealed"])
        self.assertFalse(player_two["ministry_ids"])
        player_two["hand"] = ["tax-riots"]
        state["phase"] = "plotting"
        state["active_player_id"] = "player-2"
        state = perform_action(state, "confirm_plotting", {"player_id": "player-2"})
        player_two = next(player for player in state["players"] if player["id"] == "player-2")
        self.assertTrue(player_two["committed"])
        self.assertTrue(player_two["hand_revealed"])

    def test_suspicion_controls_commit_visibility_and_event_eligibility(self):
        state = finish_ministry_draft(build_state())
        placements = ["player-2", "", "player-2", "player-2"]
        for target in placements:
            action = next(entry for entry in state["possible_actions"] if entry["target_player_id"] == target)
            state = perform_action(state, "place_suspicion", action)

        self.assertEqual(state["players"][1]["suspicion"], 3)
        self.assertFalse(state["players"][1]["hand_revealed"])
        self.assertFalse(state["players"][1]["ministry_ids"])
        self.assertEqual(state["phase"], "plotting")
        player_two = state["players"][1]
        player_two["hand"] = ["tax-riots", "farm"]
        state["active_player_id"] = "player-2"
        state["possible_actions"] = []
        state = perform_action(
            state,
            "select_commit_card",
            {"player_id": "player-2", "source": "hand", "index": 1},
        )
        state = perform_action(state, "confirm_plotting", {"player_id": "player-2"})
        commitment = state["commitments"][-1]
        self.assertTrue(commitment["face_up"])
        self.assertEqual(commitment["item_id"], "farm")

    def test_plotting_freely_rearranges_crisis_cards_across_two_scheme_slots(self):
        state = build_state()
        player_id = state["minister_of_empire_player_id"]
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        player["hand"] = ["border-raid", "farm"]
        player["scheme_slots"] = [None, "garrison"]
        state["phase"] = "plotting"
        state["active_player_id"] = player_id

        state = perform_action(
            state,
            "plotting_scheme",
            {"player_id": player_id, "hand_index": 0, "slot_index": 0, "mode": "to_scheme"},
        )
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        self.assertEqual(player["scheme_slots"], ["border-raid", "garrison"])

        state = perform_action(
            state,
            "plotting_scheme",
            {"player_id": player_id, "hand_index": 0, "slot_index": 0, "mode": "swap"},
        )
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        self.assertEqual(player["hand"], ["border-raid"])
        self.assertEqual(player["scheme_slots"], ["farm", "garrison"])

        state = perform_action(
            state,
            "plotting_scheme",
            {"player_id": player_id, "slot_index": 1, "mode": "to_hand"},
        )
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        self.assertEqual(player["hand"], ["border-raid", "garrison"])
        self.assertEqual(player["scheme_slots"], ["farm", None])

    def test_scheming_preserves_and_rebases_selected_commitment(self):
        state = build_state()
        player_id = state["minister_of_empire_player_id"]
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        player["hand"] = ["border-raid", "farm"]
        player["scheme_slots"] = [None, "garrison"]
        state["phase"] = "plotting"

        state = perform_action(
            state,
            "select_commit_card",
            {"player_id": player_id, "source": "hand", "index": 1},
        )
        state = perform_action(
            state,
            "plotting_scheme",
            {"player_id": player_id, "hand_index": 0, "slot_index": 0, "mode": "to_scheme"},
        )
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        self.assertEqual(
            player["selected_commitment"],
            {
                "item_id": "farm",
                "source": "hand",
                "index": 0,
                "face_up": False,
            },
        )

        state = perform_action(
            state,
            "plotting_scheme",
            {"player_id": player_id, "hand_index": 0, "slot_index": 0, "mode": "swap"},
        )
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        self.assertEqual(player["selected_commitment"]["source"], "scheme")
        self.assertEqual(player["selected_commitment"]["index"], 0)
        self.assertEqual(player["selected_commitment"]["item_id"], "farm")

        state = perform_action(
            state,
            "plotting_scheme",
            {"player_id": player_id, "slot_index": 0, "mode": "to_hand"},
        )
        player = next(entry for entry in state["players"] if entry["id"] == player_id)
        self.assertEqual(player["selected_commitment"]["source"], "hand")
        self.assertEqual(player["selected_commitment"]["index"], 1)
        self.assertEqual(player["hand"][1], "farm")

    def test_plotting_offers_no_voluntary_discard_actions(self):
        state = build_state()
        state["phase"] = "plotting"
        state["active_player_id"] = state["minister_of_empire_player_id"]
        state = perform_action(
            state,
            "plotting_scheme",
            {
                "player_id": state["active_player_id"],
                "hand_index": 0,
                "slot_index": 0,
                "mode": "to_scheme",
            },
        )
        self.assertNotIn("plotting_discard", {action["type"] for action in state["possible_actions"]})

    def test_minister_of_empire_cannot_receive_suspicion(self):
        state = finish_ministry_draft(build_state())
        empire_player_id = state["minister_of_empire_player_id"]

        self.assertNotIn(
            empire_player_id,
            {action["target_player_id"] for action in state["possible_actions"]},
        )
        with self.assertRaisesRegex(ValueError, "cannot receive Suspicion"):
            perform_action(
                state,
                "place_suspicion",
                {
                    "player_id": state["active_player_id"],
                    "target_player_id": empire_player_id,
                },
            )

    def test_blocking_cannot_skip_next_minister_of_empire(self):
        state = build_state()
        state["blocked_players_next_era"] = ["player-2"]

        state["era"] = 2
        _assign_ministries(state, rotate=True)

        self.assertEqual(state["minister_of_empire_player_id"], "player-2")
        self.assertNotIn("player-2", state["blocked_players"])

    def test_minister_of_empire_orders_and_locks_council_docket(self):
        state = build_state()
        state.update(
            {
                "phase": "docket_ordering",
                "active_player_id": state["minister_of_empire_player_id"],
                "council_stack": [
                    {"id": "first", "item_id": "farm", "kind": "cards", "owner_player_id": "", "face_up": False},
                    {"id": "second", "item_id": "tax-riots", "kind": "events", "owner_player_id": "", "face_up": False},
                    {"id": "third", "item_id": "garrison", "kind": "cards", "owner_player_id": "", "face_up": False},
                ],
            }
        )

        state = perform_action(
            state,
            "move_docket_card",
            {
                "player_id": state["minister_of_empire_player_id"],
                "commitment_id": "third",
                "direction": -1,
            },
        )
        self.assertEqual(
            [entry["id"] for entry in state["council_stack"]],
            ["first", "third", "second"],
        )

        state = perform_action(
            state,
            "confirm_docket_order",
            {"player_id": state["minister_of_empire_player_id"]},
        )
        self.assertEqual(state["phase"], "reveal")
        self.assertEqual(state["possible_actions"], [{"type": "reveal_next"}])
        self.assertEqual(
            [entry["status"] for entry in state["docket_resolution"]],
            ["queued", "queued", "queued"],
        )

    def test_crises_are_ordered_before_all_other_docket_cards(self):
        state = build_state()
        state.update(
            {
                "phase": "hand_reset",
                "active_player_id": state["minister_of_empire_player_id"],
                "council_stack": [
                    {"id": "development", "item_id": "farm", "kind": "cards", "owner_player_id": "", "face_up": False},
                    {"id": "crisis-one", "item_id": "border-raid", "kind": "events", "owner_player_id": "", "face_up": False},
                    {"id": "edict", "item_id": "tax-riots", "kind": "events", "owner_player_id": "", "face_up": False},
                    {"id": "crisis-two", "item_id": "border-raid", "kind": "events", "owner_player_id": "", "face_up": False},
                ],
            }
        )

        state = perform_action(state, "continue_phase", {})

        self.assertEqual(
            [entry["id"] for entry in state["council_stack"]],
            ["crisis-one", "crisis-two", "development", "edict"],
        )
        self.assertFalse(
            any(
                action["type"] == "move_docket_card"
                and action["commitment_id"] == "crisis-two"
                and action["direction"] == 1
                for action in state["possible_actions"]
            )
        )
        state = perform_action(
            state,
            "move_docket_card",
            {
                "player_id": state["minister_of_empire_player_id"],
                "commitment_id": "crisis-two",
                "direction": -1,
            },
        )
        self.assertEqual(
            [entry["id"] for entry in state["council_stack"][:2]],
            ["crisis-two", "crisis-one"],
        )
        with self.assertRaisesRegex(ValueError, "must remain before"):
            perform_action(
                state,
                "move_docket_card",
                {
                    "player_id": state["minister_of_empire_player_id"],
                    "commitment_id": "crisis-one",
                    "direction": 1,
                },
            )

    def test_invalid_docket_cannot_confirm_crisis_after_another_card(self):
        state = build_state()
        state.update(
            {
                "phase": "docket_ordering",
                "active_player_id": state["minister_of_empire_player_id"],
                "council_stack": [
                    {"id": "development", "item_id": "farm", "kind": "cards", "owner_player_id": "", "face_up": False},
                    {"id": "crisis", "item_id": "border-raid", "kind": "events", "owner_player_id": "", "face_up": False},
                ],
            }
        )

        with self.assertRaisesRegex(ValueError, "before non-Crisis"):
            perform_action(
                state,
                "confirm_docket_order",
                {"player_id": state["minister_of_empire_player_id"]},
            )

    def test_plotting_reveals_commitments_into_unshuffled_docket(self):
        state = build_state()
        state["phase"] = "plotting"
        state["commitments"] = [
            {"id": "first", "item_id": "farm", "kind": "cards", "owner_player_id": "", "face_up": False},
            {"id": "second", "item_id": "tax-riots", "kind": "events", "owner_player_id": "", "face_up": False},
            {"id": "third", "item_id": "garrison", "kind": "cards", "owner_player_id": "", "face_up": False},
        ]
        for player in state["players"][:3]:
            player["committed"] = True
        state["players"][3]["hand"] = ["farm"]
        state["active_player_id"] = "player-4"

        state = perform_action(
            state,
            "select_commit_card",
            {"player_id": "player-4", "source": "hand", "index": 0},
        )
        state = perform_action(
            state,
            "confirm_plotting",
            {"player_id": "player-4"},
        )

        self.assertEqual(state["phase"], "hand_reset")
        state = perform_action(state, "continue_phase", {})
        self.assertEqual(state["phase"], "docket_ordering")
        self.assertEqual(state["active_player_id"], state["minister_of_empire_player_id"])
        self.assertEqual(
            [entry["id"] for entry in state["council_stack"][:3]],
            ["first", "second", "third"],
        )

    def test_production_combines_storage_and_all_built_cards(self):
        state = finish_ministry_draft(build_state())
        state["cities"][0]["cards"].append("farm")
        state["stored_resources"] = {"wealth": 2}
        for _ in range(4):
            state = perform_action(state, "place_suspicion", state["possible_actions"][0])

        self.assertEqual(state["phase"], "plotting")
        self.assertEqual(state["global_resource_pool"], {"wealth": 3, "labor": 3})
        self.assertEqual(state["stored_resources"], {})

    def test_reveal_builds_card_atomically_and_applies_pillar_change(self):
        state = build_state()
        state.update(
            {
                "phase": "reveal",
                "global_resource_pool": {"labor": 1},
                "council_stack": [
                    {
                        "id": "commitment-1",
                        "item_id": "farm",
                        "kind": "cards",
                        "owner_player_id": "player-2",
                        "face_up": False,
                    }
                ],
                "docket_resolution": [
                    {
                        "id": "commitment-1",
                        "item_id": "farm",
                        "name": "Farm",
                        "is_crisis": False,
                        "status": "queued",
                    }
                ],
                "pending_placement": None,
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["global_resource_pool"], {})
        self.assertEqual(state["cities"][0]["cards"], ["farm"])
        self.assertEqual(state["pillars"]["morale"], 6)
        self.assertEqual(state["current_reveal"]["status"], "built")
        self.assertEqual(state["docket_resolution"][0]["status"], "built")

    def test_event_requirements_choose_main_or_alternative_effects(self):
        state = build_state()
        state.update(
            {
                "phase": "reveal",
                "pillars": {"treasury": 5, "stability": 5, "morale": 4},
                "global_resource_pool": {},
                "council_stack": [
                    {
                        "id": "commitment-1",
                        "item_id": "tax-riots",
                        "kind": "events",
                        "owner_player_id": "player-1",
                        "face_up": False,
                    }
                ],
                "docket_resolution": [
                    {
                        "id": "commitment-1",
                        "item_id": "tax-riots",
                        "name": "Tax Riots",
                        "is_crisis": False,
                        "status": "queued",
                    }
                ],
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["pillars"]["stability"], 4)
        self.assertEqual(state["pillars"]["treasury"], 5)
        self.assertIn("tax-riots", state["empire_discard"])
        self.assertEqual(state["docket_resolution"][0]["status"], "succeeded")

    def test_unpaid_event_records_alternative_effect_as_failed(self):
        state = build_state()
        state.update(
            {
                "phase": "reveal",
                "pillars": {"treasury": 5, "stability": 5, "morale": 5},
                "global_resource_pool": {},
                "council_stack": [
                    {
                        "id": "commitment-1",
                        "item_id": "tax-riots",
                        "kind": "events",
                        "owner_player_id": "player-1",
                        "face_up": False,
                    }
                ],
                "docket_resolution": [
                    {
                        "id": "commitment-1",
                        "item_id": "tax-riots",
                        "name": "Tax Riots",
                        "is_crisis": False,
                        "status": "queued",
                    }
                ],
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["pillars"]["treasury"], 4)
        self.assertEqual(state["pillars"]["stability"], 5)
        self.assertEqual(state["docket_resolution"][0]["status"], "failed")

    def test_general_event_resource_effect_is_chosen_by_health_minister(self):
        state = finish_ministry_draft(build_state())
        health_player_id = next(
            holder
            for ministry_id, holder in state["ministry_assignments"].items()
            if "health" in ministry_id
        )
        event = state["catalog"]["events"][0]
        event["data"]["requirements"] = []
        event["data"]["main_effects"] = [
            {"effect_type": "modify_resources", "payload": {"resource_id": "", "amount": 2}},
            {"effect_type": "modify_pillar", "payload": {"pillar_id": "morale", "amount": 1}},
        ]
        state.update(
            {
                "phase": "reveal",
                "active_player_id": state["minister_of_empire_player_id"],
                "global_resource_pool": {},
                "council_stack": [
                    {
                        "id": "resource-event",
                        "item_id": event["id"],
                        "kind": "events",
                        "owner_player_id": "",
                        "face_up": False,
                    }
                ],
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["current_reveal"]["status"], "awaiting_resource_choice")
        self.assertEqual(state["active_player_id"], health_player_id)
        self.assertTrue(all(action["type"] == "choose_event_resource" for action in state["possible_actions"]))

        wealth_action = next(
            action for action in state["possible_actions"] if action["resource_id"] == "wealth"
        )
        state = perform_action(state, "choose_event_resource", wealth_action)

        self.assertEqual(state["global_resource_pool"], {"wealth": 2})
        self.assertEqual(state["pillars"]["morale"], 6)
        self.assertEqual(state["current_reveal"]["status"], "resolved")
        self.assertIn(event["id"], state["empire_discard"])

    def test_event_choice_minister_overrides_normal_decision_rule(self):
        state = finish_ministry_draft(build_state())
        war_ministry_id, war_player_id = next(
            (ministry_id, holder)
            for ministry_id, holder in state["ministry_assignments"].items()
            if "war" in ministry_id
        )
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "ministry_id": war_ministry_id,
                "requirements": [],
                "main_effects": [
                    {"effect_type": "modify_resources", "payload": {"resource_id": "", "amount": 1}}
                ],
            }
        )
        state.update(
            {
                "phase": "reveal",
                "council_stack": [
                    {
                        "id": "minister-event",
                        "item_id": event["id"],
                        "kind": "events",
                        "owner_player_id": "",
                        "face_up": False,
                    }
                ],
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["active_player_id"], war_player_id)
        self.assertTrue(
            all(action["player_id"] == war_player_id for action in state["possible_actions"])
        )

    def test_event_converts_general_source_to_general_destination(self):
        state = finish_ministry_draft(build_state())
        health_player_id = next(
            holder
            for ministry_id, holder in state["ministry_assignments"].items()
            if "health" in ministry_id
        )
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [
                    {
                        "effect_type": "convert_resources",
                        "payload": {
                            "source_resource_id": "",
                            "target_resource_id": "",
                            "amount": 2,
                        },
                    },
                    {
                        "effect_type": "modify_pillar",
                        "payload": {"pillar_id": "morale", "amount": 1},
                    },
                ],
            }
        )
        state.update(
            {
                "phase": "reveal",
                "global_resource_pool": {"labor": 3},
                "council_stack": [
                    {
                        "id": "conversion-event",
                        "item_id": event["id"],
                        "kind": "events",
                        "owner_player_id": "",
                        "face_up": False,
                    }
                ],
            }
        )

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["active_player_id"], health_player_id)
        self.assertEqual(
            [(action["stage"], action["resource_id"]) for action in state["possible_actions"]],
            [("source", "labor")],
        )

        state = perform_action(
            state,
            "choose_event_conversion_resource",
            state["possible_actions"][0],
        )
        self.assertTrue(
            all(action["stage"] == "target" for action in state["possible_actions"])
        )
        wealth_action = next(
            action for action in state["possible_actions"] if action["resource_id"] == "wealth"
        )
        state = perform_action(state, "choose_event_conversion_resource", wealth_action)
        self.assertEqual(
            [action["amount"] for action in state["possible_actions"]],
            [0, 1, 2],
        )
        amount_action = next(
            action for action in state["possible_actions"] if action["amount"] == 2
        )
        state = perform_action(state, "choose_event_conversion_resource", amount_action)

        self.assertEqual(state["global_resource_pool"], {"labor": 1, "wealth": 2})
        self.assertEqual(state["pillars"]["morale"], 6)
        self.assertEqual(state["current_reveal"]["status"], "resolved")

    def test_event_adds_pending_refill_draw_for_choice_minister_or_empire_fallback(self):
        for use_choice_minister in (True, False):
            with self.subTest(use_choice_minister=use_choice_minister):
                state = finish_ministry_draft(build_state())
                health_ministry_id, health_player_id = next(
                    (ministry_id, holder)
                    for ministry_id, holder in state["ministry_assignments"].items()
                    if "health" in ministry_id
                )
                expected_player_id = (
                    health_player_id
                    if use_choice_minister
                    else state["minister_of_empire_player_id"]
                )
                event = state["catalog"]["events"][0]
                event["data"].update(
                    {
                        "ministry_id": health_ministry_id if use_choice_minister else "",
                        "requirements": [],
                        "main_effects": [{"effect_type": "draw_card", "payload": {}}],
                    }
                )
                state.update(
                    {
                        "phase": "reveal",
                        "council_stack": [
                            {
                                "id": "draw-event",
                                "item_id": event["id"],
                                "kind": "events",
                                "owner_player_id": "",
                                "face_up": False,
                            }
                        ],
                    }
                )
                hand_sizes = {
                    player["id"]: len(player["hand"])
                    for player in state["players"]
                }
                pending_before = next(
                    player for player in state["players"] if player["id"] == expected_player_id
                )["pending_draws"]

                state = perform_action(state, "reveal_next", {})

                self.assertEqual(
                    len(next(player for player in state["players"] if player["id"] == expected_player_id)["hand"]),
                    hand_sizes[expected_player_id],
                )
                self.assertEqual(
                    next(player for player in state["players"] if player["id"] == expected_player_id)["pending_draws"],
                    pending_before + 1,
                )
                self.assertTrue(
                    all(
                        len(player["hand"]) == hand_sizes[player["id"]]
                        for player in state["players"]
                        if player["id"] != expected_player_id
                    )
                )

    def test_event_token_effects_add_remove_and_clamp_at_zero(self):
        state = build_state()
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [
                    {
                        "effect_type": "modify_plague",
                        "payload": {"scope": "city", "amount": 2},
                    }
                ],
            }
        )
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "add-plague",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["cities"][0]["condition_tokens"], {"plague-token": 2})

        event["data"]["main_effects"] = [
            {
                "effect_type": "modify_plague",
                "payload": {"scope": "city", "amount": -3},
            }
        ]
        state["catalog"]["events"][0] = event
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "remove-plague",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["cities"][0]["condition_tokens"], {})

    def test_grouped_event_token_effect_applies_every_change_to_one_city(self):
        state = build_state()
        state["cities"].append(
            {
                "id": "frontier",
                "name": "Frontier",
                "city_card_id": "capital",
                "building_slots": 4,
                "cards": [],
                "condition_tokens": {},
            }
        )
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [
                    {
                        "effect_type": "modify_city_tokens",
                        "payload": {
                            "tokens": {
                                "plague-token": 1,
                                "unrest-token": 2,
                                "fortified-token": 1,
                            }
                        },
                    }
                ],
            }
        )
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "fortified-riots",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["cities"][0]["condition_tokens"], {})
        self.assertEqual(
            {action["city_id"] for action in state["possible_actions"]},
            {"capital", "frontier"},
        )

        choice = next(
            action
            for action in state["possible_actions"]
            if action["city_id"] == "frontier"
        )
        state = perform_action(state, "choose_event_token_city", choice)

        self.assertEqual(
            state["cities"][1]["condition_tokens"],
            {"plague-token": 1, "unrest-token": 2, "fortified-token": 1},
        )
        self.assertEqual(state["cities"][0]["condition_tokens"], {})

    def test_unspecified_unrest_uses_state_minister_scope_and_city_choices(self):
        state = build_state()
        state["cities"].append(
            {
                "id": "frontier",
                "name": "Frontier",
                "city_card_id": "capital",
                "building_slots": 4,
                "cards": [],
                "condition_tokens": {},
            }
        )
        state_player_id = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "state" in ministry_id
        )
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [
                    {
                        "effect_type": "modify_unrest",
                        "payload": {"scope": "unspecified", "amount": 2},
                    }
                ],
            }
        )
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "unrest-event",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["active_player_id"], state_player_id)
        self.assertEqual(
            {action["scope"] for action in state["possible_actions"]},
            {"global", "city"},
        )
        city_scope = next(action for action in state["possible_actions"] if action["scope"] == "city")
        state = perform_action(state, "choose_event_unrest_scope", city_scope)
        frontier = next(action for action in state["possible_actions"] if action["city_id"] == "frontier")
        state = perform_action(state, "choose_event_token_city", frontier)

        self.assertEqual(state["cities"][0]["condition_tokens"], {})
        self.assertEqual(state["cities"][1]["condition_tokens"], {"unrest-token": 2})
        self.assertIn(event["id"], state["empire_discard"])

    def test_minister_of_war_chooses_destroyed_structure(self):
        state = build_state()
        war_player_id = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "war" in ministry_id
        )
        state["cities"][0]["cards"] = ["farm", "garrison"]
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [
                    {"effect_type": "destroy_building", "payload": {"amount": 1}}
                ],
            }
        )
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "destroy-event",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["active_player_id"], war_player_id)
        choice = next(
            action for action in state["possible_actions"]
            if action["card_id"] == "garrison"
        )
        state = perform_action(state, "choose_event_destroy_building", choice)
        self.assertEqual(state["cities"][0]["cards"], ["farm"])
        self.assertIn("garrison", state["empire_discard"])

    def test_health_minister_is_not_immune_to_forced_discard(self):
        state = build_state()
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [
                    {
                        "effect_type": "discard_cards",
                        "payload": {"target": "all_players", "amount": 1},
                    }
                ],
            }
        )
        for player in state["players"]:
            player["hand"] = ["farm"]
            player["scheme_slots"] = [None, None]
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "discard-event",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})

        self.assertTrue(all(not player["hand"] for player in state["players"]))

    def test_condition_phase_applies_plague_morale_loss_per_city(self):
        state = build_state()
        state["cities"][0]["condition_tokens"] = {"plague-token": 2}
        state["phase"] = "condition"

        state = perform_action(state, "continue_phase", {})

        self.assertEqual(state["pillars"]["morale"], 4)
        self.assertEqual(state["cities"][0]["condition_tokens"], {"plague-token": 2})
        self.assertEqual(state["phase"], "storage")

    def test_event_can_suppress_plague_morale_loss_until_era_end(self):
        state = build_state()
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [{"effect_type": "suppress_plague_morale", "payload": {}}],
            }
        )
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "plague-relief",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})
        self.assertTrue(state["plague_morale_suppressed"])

        state["cities"][0]["condition_tokens"] = {"plague-token": 2}
        state["phase"] = "condition"
        state = perform_action(state, "continue_phase", {})

        self.assertEqual(state["pillars"]["morale"], 5)
        self.assertEqual(state["cities"][0]["condition_tokens"], {"plague-token": 2})
        self.assertEqual(state["phase"], "storage")

        _end_era(state)
        self.assertFalse(state["plague_morale_suppressed"])

    def test_specific_and_generic_storage_are_validated(self):
        warehouse = catalog_entry(
            "warehouse",
            "Warehouse",
            "cards",
            category="structure",
            data={
                "persistent_effects": [
                    {"effect_type": "storage", "payload": {"amount": 2, "resource_id": "wealth"}}
                ],
            },
        )
        state = build_state(card_entries=[*CARDS, warehouse])
        state["cities"][0]["cards"].append("warehouse")
        state.update({"phase": "storage", "global_resource_pool": {"labor": 3, "wealth": 3}})
        state["active_player_id"] = next(
            (
                holder
                for ministry_id, holder in state["ministry_assignments"].items()
                if "cities" in ministry_id
            ),
            state["minister_of_empire_player_id"],
        )

        with self.assertRaisesRegex(ValueError, "storage capacity"):
            perform_action(
                state,
                "store_resources",
                {"player_id": state["active_player_id"], "resources": {"labor": 3, "wealth": 2}},
            )

        stored = perform_action(
            state,
            "store_resources",
            {"player_id": state["active_player_id"], "resources": {"labor": 2, "wealth": 2}},
        )
        self.assertEqual(stored["stored_resources"], {"labor": 2, "wealth": 2})
        self.assertEqual(stored["phase"], "crisis_intake")

    def test_hand_refill_draws_up_to_three_and_state_up_to_four_plus_pending(self):
        state = build_state()
        state_player_id = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "state" in ministry_id
        )
        state_player = next(player for player in state["players"] if player["id"] == state_player_id)
        state_player["hand"] = ["border-raid"]
        state_player["pending_draws"] = 1
        state["phase"] = "hand_refill"
        state["active_player_id"] = state_player_id
        state["refill_completed"] = []

        state = perform_action(
            state,
            "refill_hand",
            {"player_id": state_player_id},
        )

        self.assertEqual(len(next(player for player in state["players"] if player["id"] == state_player_id)["hand"]), 5)
        self.assertEqual(next(player for player in state["players"] if player["id"] == state_player_id)["pending_draws"], 0)

        ordinary_player = next(
            player for player in state["players"]
            if player["id"] != state_player_id
        )
        ordinary_player["hand"] = ["border-raid"]
        state["phase"] = "hand_refill"
        state["active_player_id"] = ordinary_player["id"]
        state["refill_completed"] = []
        state = perform_action(
            state,
            "refill_hand",
            {"player_id": ordinary_player["id"]},
        )

        self.assertEqual(
            len(next(player for player in state["players"] if player["id"] == ordinary_player["id"])["hand"]),
            3,
        )

    def test_event_reduces_every_players_refill_by_one(self):
        state = build_state()
        event = state["catalog"]["events"][0]
        event["data"].update(
            {
                "requirements": [],
                "main_effects": [{"effect_type": "reduce_refill_draws", "payload": {}}],
            }
        )
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "refill-penalty",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["refill_draw_penalty"], 1)
        state_player_id = next(
            holder for ministry_id, holder in state["ministry_assignments"].items()
            if "state" in ministry_id
        )
        ordinary_player = next(player for player in state["players"] if player["id"] != state_player_id)
        state["phase"] = "hand_refill"
        state["active_player_id"] = ordinary_player["id"]
        state["refill_completed"] = []
        ordinary_player["hand"] = []
        state = perform_action(state, "refill_hand", {"player_id": ordinary_player["id"]})

        self.assertEqual(
            len(next(player for player in state["players"] if player["id"] == ordinary_player["id"])["hand"]),
            2,
        )

    def test_fifth_era_crisis_intake_and_hand_reset_preserve_crises(self):
        state = build_state()
        state["era"] = 5
        state["phase"] = "crisis_intake"
        crisis_counts = {
            player["id"]: player["hand"].count("border-raid")
            for player in state["players"]
        }

        state = perform_action(state, "continue_phase", {})

        self.assertEqual(state["phase"], "hand_refill")
        self.assertTrue(
            all(
                player["hand"].count("border-raid") == crisis_counts[player["id"]] + 1
                for player in state["players"]
            )
        )

    def test_event_tag_requirement_uses_permanent_empire_tags(self):
        state = build_state()
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "border-raid",
                "item_id": "border-raid",
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]
        state["cities"][0]["cards"].append("garrison")

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["pillars"]["stability"], 4)
        self.assertEqual(state["pillars"]["treasury"], 5)
        self.assertIn("border-raid", state["crisis_discard"])
        self.assertNotIn("border-raid", state["empire_discard"])

    def test_event_effect_can_compare_one_tag_count_to_another(self):
        state = build_state()
        state["cities"][0]["cards"] = ["farm", "farm", "garrison"]
        event = state["catalog"]["events"][0]
        event["data"]["requirements"] = []
        event["data"]["main_effects"] = [
            {
                "effect_type": "modify_pillar",
                "payload": {"pillar_id": "morale", "amount": 1},
                "condition": {
                    "source_type": "tag",
                    "source_id": "military",
                    "operator": "lt",
                    "target_type": "tag",
                    "target_id": "food",
                },
            },
            {
                "effect_type": "modify_pillar",
                "payload": {"pillar_id": "treasury", "amount": 1},
                "condition": {
                    "source_type": "tag",
                    "source_id": "food",
                    "operator": "lt",
                    "target_type": "tag",
                    "target_id": "military",
                },
            },
        ]
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "tag-comparison-event",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["pillars"]["morale"], 6)
        self.assertEqual(state["pillars"]["treasury"], 5)

    def test_event_waives_one_tag_for_only_the_next_structure_this_era(self):
        temple = catalog_entry(
            "temple",
            "Temple",
            "cards",
            category="structure",
            data={"required_tags": {"food": 1}, "tags": {"faith": 1}},
        )
        state = build_state(card_entries=[*CARDS, temple])
        event = state["catalog"]["events"][0]
        event["data"]["requirements"] = []
        event["data"]["main_effects"] = [
            {"effect_type": "waive_next_structure_tag_requirement", "payload": {}}
        ]
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "waiver-event",
                "item_id": event["id"],
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            },
            {
                "id": "first-temple",
                "item_id": "temple",
                "kind": "cards",
                "owner_player_id": "",
                "face_up": False,
            },
            {
                "id": "second-temple",
                "item_id": "temple",
                "kind": "cards",
                "owner_player_id": "",
                "face_up": False,
            },
        ]

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["structure_tag_requirement_waivers"], 1)

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["cities"][0]["cards"], ["temple"])
        self.assertEqual(state["structure_tag_requirement_waivers"], 0)

        state = perform_action(state, "reveal_next", {})
        self.assertEqual(state["cities"][0]["cards"], ["temple"])
        self.assertIn("temple", state["empire_discard"])

    def test_collapse_reveals_agendas_and_calculates_winners(self):
        state = build_state()
        state["cities"][0]["cards"].append("farm")
        state["pillars"]["morale"] = 1
        state["phase"] = "reveal"
        state["council_stack"] = [
            {
                "id": "collapse-event",
                "item_id": "tax-riots",
                "kind": "events",
                "owner_player_id": "",
                "face_up": False,
            }
        ]
        state["catalog"]["events"][0]["data"]["requirements"] = []
        state["catalog"]["events"][0]["data"]["main_effects"] = [
            {"effect_type": "modify_pillar", "payload": {"pillar_id": "morale", "amount": -1}}
        ]

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["phase"], "game_over")
        self.assertTrue(state["agendas_revealed"])
        self.assertEqual(state["winner_player_ids"], ["player-3"])
        self.assertTrue(all(result["eligible"] for result in state["agenda_results"].values()))
        self.assertTrue(all(result["score"] == 8 for result in state["agenda_results"].values()))


class TestGameRoomService(unittest.IsolatedAsyncioTestCase):
    async def test_service_applies_generic_game_action(self):
        service = GameRoomService()
        user = User(id="user-1", username="Player One")
        state = finish_ministry_draft(build_state())
        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        action = state["possible_actions"][0]

        next_state = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="place_suspicion",
            payload=action,
        )

        self.assertEqual(len(next_state["suspicion_placements"]), 1)

    async def test_memory_room_lifecycle_records_history(self):
        service = GameRoomService()
        user = User(id="user-1", username="Player One")

        room = await service.create_room(user=user, game_type="chronicle_solo")
        self.assertEqual(room["state"], ROOM_STATE_IN_GAME)
        await service.enqueue_end_room(room_id=room["id"], user=user)
        finished = await service.get_room(room_id=room["id"], user=user)
        result = await service.get_result(room_id=room["id"], user_id=user.id)
        history = await service.list_history(user_id=user.id)

        self.assertEqual(finished["state"], ROOM_STATE_FINISHED)
        self.assertEqual(result["room_id"], room["id"])
        self.assertEqual([entry["room_id"] for entry in history], [room["id"]])

    async def test_other_users_cannot_read_room_or_result(self):
        service = GameRoomService()
        owner = User(id="owner", username="Owner")
        other = User(id="other", username="Other")
        room = await service.create_room(user=owner, game_type="chronicle_solo")
        await service.enqueue_end_room(room_id=room["id"], user=owner)

        self.assertIsNone(await service.get_room(room_id=room["id"], user=other))
        self.assertIsNone(await service.get_result(room_id=room["id"], user_id=other.id))

    async def test_rejects_unavailable_game_type(self):
        service = GameRoomService()
        with self.assertRaisesRegex(ValueError, "Only Chronicle solo"):
            await service.create_room(
                user=User(id="user-1", username="Player One"),
                game_type="campaign",
            )
