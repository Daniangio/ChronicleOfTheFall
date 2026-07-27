from __future__ import annotations

import unittest

from backend.app.game_room_service import GameRoomService, ROOM_STATE_FINISHED, ROOM_STATE_IN_GAME
from backend.app.goldfishing_engine import (
    _apply_on_build_effects,
    _begin_ministry_assignment,
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
    setup_pool_ids = ["farm", "garrison"] * 7 + ["farm"]
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
    while state["phase"] == "ministry_assignment":
        action = state["possible_actions"][0]
        state = perform_action(state, "choose_ministry", action)
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

        self.assertEqual(state["phase"], "ministry_assignment")
        self.assertEqual(state["rules_version"], "anonymous-council-v0.3")
        self.assertEqual(state["cities"][0]["city_card_id"], "capital")
        self.assertEqual(state["cities"][0]["building_slots"], 4)
        self.assertTrue(all(len(player["hand"]) == 5 for player in state["players"]))
        self.assertTrue(all(len(player["scheme_slots"]) == 2 for player in state["players"]))
        self.assertEqual(state["pillars"], {"treasury": 5, "stability": 5, "morale": 5})

    def test_ministry_draft_starts_left_of_empire_and_wraps(self):
        state = build_state()
        chooser_order = []
        while state["phase"] == "ministry_assignment":
            chooser_order.append(state["active_player_id"])
            state = perform_action(state, "choose_ministry", state["possible_actions"][0])

        self.assertEqual(chooser_order, ["player-2", "player-3", "player-4", "player-1"])
        self.assertEqual(state["phase"], "suspicion")
        self.assertEqual(state["active_player_id"], "player-1")
        self.assertEqual(len(state["ministry_assignments"]), 5)
        self.assertEqual(len(state["players"][0]["ministry_ids"]), 2)

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

        _begin_ministry_assignment(state, rotate=True)

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
        self.assertEqual(stored["phase"], "cleanup")

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
