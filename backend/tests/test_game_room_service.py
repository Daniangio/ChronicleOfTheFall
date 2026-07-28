from __future__ import annotations

import unittest

from backend.app.game_room_service import GameRoomService, ROOM_STATE_FINISHED, ROOM_STATE_IN_GAME
from backend.app.goldfishing_engine import (
    _apply_on_build_effects,
    _assign_ministries,
    _end_era,
    build_goldfishing_state,
    perform_action,
)
from backend.app.server_models import User


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
        "deck_ids": [*setup_pool_ids, *(["farm", "garrison", "tax-riots", "border-raid"] * 12)],
        "setup_pool_ids": setup_pool_ids,
        "deck_id": "empire-deck",
        "initial_city_card_id": "capital",
        "event_entries": EVENTS,
        "ministry_entries": MINISTRIES,
        "pillar_entries": PILLARS,
        "agenda_entries": [
            catalog_entry(
                "survivor",
                "Survivor",
                "agendas",
                data={"conditions": [{"source_type": "tag", "source_id": "food", "operator": "gte", "amount": 1}]},
            )
        ] * 4,
    }
    arguments.update(overrides)
    return build_goldfishing_state(**arguments)


def finish_ministry_draft(state: dict) -> dict:
    return state


class TestAnonymousCouncilEngine(unittest.TestCase):
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
        self.assertEqual(len(state["players"][0]["ministry_ids"]), 2)

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
        self.assertEqual(len(set(non_empire_assignments.values())), 3)

    def test_suspicion_controls_commit_visibility_and_event_eligibility(self):
        state = finish_ministry_draft(build_state())
        placements = ["player-2", "", "player-2", "player-2"]
        for target in placements:
            action = next(entry for entry in state["possible_actions"] if entry["target_player_id"] == target)
            state = perform_action(state, "place_suspicion", action)

        self.assertEqual(state["players"][1]["suspicion"], 3)
        state = perform_action(state, "continue_phase", {})
        state = perform_action(state, "continue_phase", {})
        self.assertEqual(state["phase"], "plotting")
        player_two = state["players"][1]
        player_two["hand"] = ["tax-riots", "farm"]
        state["active_player_id"] = "player-2"
        state["possible_actions"] = []
        state = perform_action(state, "commit_card", {"player_id": "player-2", "source": "hand", "index": 1})
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
            "commit_card",
            {"player_id": "player-4", "source": "hand", "index": 0},
        )

        self.assertEqual(state["phase"], "docket_ordering")
        self.assertEqual(state["active_player_id"], state["minister_of_empire_player_id"])
        self.assertEqual(
            [entry["id"] for entry in state["council_stack"][:3]],
            ["first", "second", "third"],
        )

    def test_production_combines_storage_and_all_built_cards(self):
        state = finish_ministry_draft(build_state())
        for _ in range(4):
            state = perform_action(state, "place_suspicion", state["possible_actions"][0])
        state["cities"][0]["cards"].append("farm")
        state["stored_resources"] = {"wealth": 2}

        state = perform_action(state, "continue_phase", {})

        self.assertEqual(state["phase"], "queued_projects")
        self.assertEqual(state["global_resource_pool"], {"wealth": 3, "labor": 3})
        self.assertEqual(state["stored_resources"], {})
        state = perform_action(state, "continue_phase", {})
        self.assertEqual(state["phase"], "plotting")

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
                "stalled_projects": [],
                "pending_placement": None,
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["global_resource_pool"], {})
        self.assertEqual(state["cities"][0]["cards"], ["farm"])
        self.assertEqual(state["pillars"]["morale"], 6)
        self.assertEqual(state["current_reveal"]["status"], "built")

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
            }
        )

        state = perform_action(state, "reveal_next", {})

        self.assertEqual(state["pillars"]["stability"], 4)
        self.assertEqual(state["pillars"]["treasury"], 5)
        self.assertIn("tax-riots", state["empire_discard"])

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

    def test_hand_refill_draws_three_and_state_draws_four_plus_pending(self):
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

        self.assertEqual(len(next(player for player in state["players"] if player["id"] == state_player_id)["hand"]), 6)
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
            4,
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

        self.assertEqual(state["phase"], "hand_reset")
        self.assertTrue(
            all(
                player["hand"].count("border-raid") == crisis_counts[player["id"]] + 1
                for player in state["players"]
            )
        )
        state["players"][0]["hand"].extend(["farm", "tax-riots"])
        empire_discard_before = len(state["empire_discard"])
        non_crisis_in_hands = sum(
            item_id != "border-raid"
            for player in state["players"]
            for item_id in player["hand"]
        )

        state = perform_action(state, "continue_phase", {})

        self.assertEqual(state["phase"], "hand_refill")
        self.assertTrue(all(all(item_id == "border-raid" for item_id in player["hand"]) for player in state["players"]))
        self.assertEqual(len(state["empire_discard"]), empire_discard_before + non_crisis_in_hands)

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
        self.assertEqual([project["card_id"] for project in state["stalled_projects"]], ["temple"])

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
        self.assertEqual(state["winner_player_ids"], [player["id"] for player in state["players"]])


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
