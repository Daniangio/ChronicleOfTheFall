import unittest

from backend.app.game_room_service import GameRoomService, ROOM_STATE_FINISHED, ROOM_STATE_IN_GAME
from backend.app.server_models import User


def manual_mana_node(tag_id: str, amount: int) -> dict:
    return {
        "name": "Manual Action",
        "trigger": "manual_action",
        "ends_turn": False,
        "preconditions": {"exhaust": True, "empire_tags": []},
        "effects": [{"effect_type": "add_resources", "payload": {"resources": [tag_id] * amount}}],
    }


class TestGameRoomService(unittest.IsolatedAsyncioTestCase):
    async def test_memory_room_lifecycle_records_history(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")

        room = await service.create_room(user=user, game_type="chronicle_solo")
        self.assertEqual(room["state"], ROOM_STATE_IN_GAME)
        self.assertEqual(room["mode"], "solo")
        self.assertEqual(room["game_type"], "chronicle_solo")

        await service.enqueue_end_room(room_id=room["id"], user=user)
        finished = await service.get_room(room_id=room["id"], user=user)
        result = await service.get_result(room_id=room["id"], user_id=user.id)
        history = await service.list_history(user_id=user.id)

        self.assertEqual(finished["state"], ROOM_STATE_FINISHED)
        self.assertEqual(result["room_id"], room["id"])
        self.assertEqual(result["outcome"], "completed")
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
        user = User(id="user_1", username="Player One")

        with self.assertRaisesRegex(ValueError, "Only Chronicle solo"):
            await service.create_room(user=user, game_type="campaign")

    async def test_memory_room_stores_and_mutates_goldfishing_state(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": ["lumber-camp"], "mana": {}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "lumber-camp", "contributions": {}}],
            "cities": [{"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []}],
            "catalog": {
                "cards": [
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"labor": 1}, "logic_nodes": [manual_mana_node("labor", 1)]},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        stored = await service.get_game_state(room_id=room["id"], user=user)
        self.assertEqual(stored["mode"], "goldfishing")

        proposed = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="propose_project",
            payload={"player_id": "player-1", "card_id": "lumber-camp"},
        )
        self.assertEqual(proposed["projects"][0]["card_id"], "lumber-camp")

    async def test_can_propose_project_from_common_pool(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": [], "mana": {}, "passed": False}],
            "common_pool": ["lumber-camp"],
            "projects": [],
            "cities": [{"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []}],
            "catalog": {
                "cards": [
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"labor": 1}},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        proposed = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="propose_project",
            payload={"player_id": "player-1", "card_id": "lumber-camp"},
        )

        self.assertEqual(proposed["projects"][0]["card_id"], "lumber-camp")
        self.assertEqual(proposed["common_pool"], [])
        self.assertEqual(proposed["players"][0]["hand"], [])

    async def test_foundation_card_can_be_exhausted(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [
                {"id": "player-1", "name": "Player 1", "hand": [], "mana": {}, "passed": False},
                {"id": "player-2", "name": "Player 2", "hand": [], "mana": {}, "passed": False},
            ],
            "projects": [{"id": "project-1", "card_id": "lumber-camp", "contributions": {}}],
            "cities": [
                {
                    "id": "capital",
                    "name": "Capital",
                    "foundation_card_id": "capital-foundation",
                    "cards": [],
                    "exhausted_card_ids": [],
                }
            ],
            "catalog": {
                "cards": [
                    {
                        "id": "capital-foundation",
                        "name": "Capital Foundation",
                        "kind": "cards",
                        "category": "foundation",
                        "summary": "",
                        "color": None,
                        "data": {"logic_nodes": [manual_mana_node("labor", 1)]},
                    },
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"labor": 1}},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        updated = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="exhaust_card",
            payload={"player_id": "player-1", "city_id": "capital", "card_id": "capital-foundation"},
        )

        self.assertEqual(updated["players"][0]["mana"], {"labor": 1})
        self.assertEqual(updated["cities"][0]["exhausted_card_ids"], ["capital-foundation"])
        self.assertEqual(updated["active_player_id"], "player-1")

    async def test_manual_action_logic_node_produces_mana(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": ["workshop"], "mana": {}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "lumber-camp", "contributions": {}}],
            "cities": [{"id": "capital", "name": "Capital", "cards": ["logic-mill"], "exhausted_card_ids": []}],
            "catalog": {
                "cards": [
                    {
                        "id": "logic-mill",
                        "name": "Logic Mill",
                        "kind": "cards",
                        "category": "building",
                        "summary": "",
                        "color": None,
                        "data": {
                            "logic_nodes": [
                                {
                                    "name": "Produce Labor",
                                    "trigger": "manual_action",
                                    "ends_turn": False,
                                    "preconditions": {
                                        "logic_gate": "AND",
                                        "conditions": [
                                            {
                                                "target": "this_card",
                                                "variable": "is_exhausted",
                                                "operator": "==",
                                                "value": False,
                                            }
                                        ],
                                    },
                                    "effects": [
                                        {
                                            "effect_type": "set_state",
                                            "payload": {"variable": "is_exhausted", "value": True},
                                        },
                                        {
                                            "effect_type": "modify_mana",
                                            "payload": {"mana_type": "labor", "amount": 2},
                                        },
                                    ],
                                }
                            ]
                        },
                    },
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"labor": 2}},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        updated = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="exhaust_card",
            payload={"player_id": "player-1", "city_id": "capital", "card_id": "logic-mill"},
        )

        self.assertEqual(updated["players"][0]["mana"], {"labor": 2})
        self.assertEqual(updated["cities"][0]["exhausted_card_ids"], ["logic-mill"])

    async def test_all_players_passing_runs_decay(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [
                {"id": "player-1", "name": "Player 1", "hand": [], "mana": {"labor": 1}, "passed": False},
                {"id": "player-2", "name": "Player 2", "hand": [], "mana": {}, "passed": False},
            ],
            "projects": [
                {"id": "project-1", "card_id": "lumber-camp", "contributions": {"labor": 1}},
                {"id": "project-2", "card_id": "militia-garrison", "contributions": {"wealth": 0}},
            ],
            "cities": [
                {
                    "id": "capital",
                    "name": "Capital",
                    "foundation_card_id": "capital-foundation",
                    "cards": [],
                    "exhausted_card_ids": ["capital-foundation"],
                }
            ],
            "catalog": {
                "cards": [
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"labor": 1}, "placement": "empire"},
                    },
                    {
                        "id": "militia-garrison",
                        "name": "Militia Garrison",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"wealth": 1}},
                    },
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        after_first_pass = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="pass_turn",
            payload={"player_id": "player-1"},
        )
        self.assertEqual(after_first_pass["active_player_id"], "player-2")
        self.assertEqual(after_first_pass["players"][0]["mana"], {})

        self.assertEqual(after_first_pass["phase"], "crisis")
        self.assertEqual(after_first_pass["active_player_id"], "player-2")
        self.assertEqual(after_first_pass["cities"][0]["cards"], [])
        self.assertEqual(after_first_pass["cities"][0]["exhausted_card_ids"], [])
        self.assertEqual(after_first_pass["projects"], [
            {"id": "project-1", "card_id": "lumber-camp", "contributions": {"labor": 1}},
            {"id": "project-2", "card_id": "militia-garrison", "contributions": {}},
        ])

    async def test_completed_project_can_be_built_as_free_action(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": [], "mana": {"labor": 1}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "lumber-camp", "contributions": {}}],
            "cities": [{"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []}],
            "catalog": {
                "cards": [
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"labor": 1}},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        assigned = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="assign_mana",
            payload={"player_id": "player-1", "project_id": "project-1", "tag_id": "labor", "amount": 1},
        )
        self.assertTrue(any(action["type"] == "build_project" for action in assigned["possible_actions"]))

        built = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="build_project",
            payload={"player_id": "player-1", "project_id": "project-1", "city_id": "capital"},
        )
        self.assertEqual(built["cities"][0]["cards"], ["lumber-camp"])
        self.assertEqual(built["projects"], [])
        self.assertEqual(built["active_player_id"], "player-1")

    async def test_completed_city_project_creates_city_zone(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": [], "mana": {}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "frontier-town", "contributions": {}}],
            "cities": [{"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []}],
            "catalog": {
                "cards": [
                    {
                        "id": "frontier-town",
                        "name": "Frontier Town",
                        "kind": "cards",
                        "category": "city",
                        "summary": "",
                        "color": None,
                        "data": {"card_type": "city", "building_slots": 2},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        built = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="build_project",
            payload={"player_id": "player-1", "project_id": "project-1", "city_id": "__new_city__"},
        )
        self.assertEqual(len(built["cities"]), 2)
        self.assertEqual(built["cities"][1]["city_card_id"], "frontier-town")
        self.assertEqual(built["cities"][1]["building_slots"], 2)
        self.assertEqual(built["cities"][1]["cards"], [])

    async def test_building_project_requires_open_city_slot(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": [], "mana": {"labor": 1}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "workshop", "contributions": {}}],
            "cities": [
                {"id": "capital", "name": "Capital", "city_card_id": "capital-city", "building_slots": 1, "cards": ["farm"], "exhausted_card_ids": []},
                {"id": "frontier", "name": "Frontier", "city_card_id": "frontier-town", "building_slots": 2, "cards": [], "exhausted_card_ids": []},
            ],
            "catalog": {
                "cards": [
                    {"id": "capital-city", "name": "Capital City", "kind": "cards", "category": "city", "summary": "", "color": None, "data": {"card_type": "city", "building_slots": 1}},
                    {"id": "frontier-town", "name": "Frontier Town", "kind": "cards", "category": "city", "summary": "", "color": None, "data": {"card_type": "city", "building_slots": 2}},
                    {"id": "farm", "name": "Farm", "kind": "cards", "category": "building", "summary": "", "color": None, "data": {}},
                    {"id": "workshop", "name": "Workshop", "kind": "cards", "category": "building", "summary": "", "color": None, "data": {"cost": {"labor": 1}}},
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        assigned = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="assign_mana",
            payload={"player_id": "player-1", "project_id": "project-1", "tag_id": "labor", "amount": 1},
        )
        build_actions = [action for action in assigned["possible_actions"] if action["type"] == "build_project"]
        self.assertEqual([action["city_id"] for action in build_actions], ["frontier"])

    async def test_project_build_options_respect_city_requirements(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": [], "mana": {"wealth": 1}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "market-hub", "contributions": {}}],
            "cities": [
                {"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []},
                {"id": "frontier", "name": "Frontier", "cards": ["paved-road"], "exhausted_card_ids": []},
            ],
            "catalog": {
                "cards": [
                    {
                        "id": "paved-road",
                        "name": "Paved Road",
                        "kind": "cards",
                        "category": "route",
                        "summary": "",
                        "color": None,
                        "data": {},
                    },
                    {
                        "id": "market-hub",
                        "name": "Market Hub",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {
                            "cost": {"wealth": 1},
                            "requirements": [{"type": "has_card", "card_id": "paved-road", "scope": "city"}],
                        },
                    },
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        assigned = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="assign_mana",
            payload={"player_id": "player-1", "project_id": "project-1", "tag_id": "wealth", "amount": 1},
        )
        build_actions = [action for action in assigned["possible_actions"] if action["type"] == "build_project"]
        self.assertEqual([action["city_id"] for action in build_actions], ["frontier"])

    async def test_project_build_options_respect_counted_city_tags(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": [], "mana": {"wealth": 1}, "passed": False}],
            "projects": [{"id": "project-1", "card_id": "granary", "contributions": {}}],
            "cities": [
                {"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []},
                {"id": "frontier", "name": "Frontier", "cards": ["farm"], "exhausted_card_ids": []},
            ],
            "catalog": {
                "cards": [
                    {
                        "id": "farm",
                        "name": "Farm",
                        "kind": "cards",
                        "category": "building",
                        "summary": "",
                        "color": None,
                        "data": {"tags": {"food": 2}},
                    },
                    {
                        "id": "granary",
                        "name": "Granary",
                        "kind": "cards",
                        "category": "building",
                        "summary": "",
                        "color": None,
                        "data": {"cost": {"wealth": 1}, "required_city_tags": {"food": 2}},
                    },
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        assigned = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="assign_mana",
            payload={"player_id": "player-1", "project_id": "project-1", "tag_id": "wealth", "amount": 1},
        )
        build_actions = [action for action in assigned["possible_actions"] if action["type"] == "build_project"]
        self.assertEqual([action["city_id"] for action in build_actions], ["frontier"])

    async def test_ministry_resource_action_uses_configured_resources(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "active_player_id": "player-1",
            "minister_of_empire_player_id": "player-2",
            "selected_ministries": {"player-1": "minister-of-infrastructure"},
            "players": [{"id": "player-1", "name": "Player 1", "hand": ["workshop"], "mana": {}, "passed": False}],
            "projects": [],
            "cities": [{"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []}],
            "catalog": {
                "cards": [
                    {
                        "id": "workshop",
                        "name": "Workshop",
                        "kind": "cards",
                        "category": "building",
                        "summary": "",
                        "color": None,
                        "data": {},
                    }
                ],
                "tags": [],
                "ministries": [
                    {
                        "id": "minister-of-infrastructure",
                        "name": "Minister of Infrastructure",
                        "kind": "ministries",
                        "category": "ministry",
                        "summary": "",
                        "color": None,
                        "data": {"infrastructure_resources": ["labor", "wealth"]},
                    }
                ],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        updated = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="use_ministry_resource",
            payload={"player_id": "player-1", "tag_id": "labor"},
        )
        self.assertEqual(updated["players"][0]["mana"], {"labor": 1})

    async def test_continue_phase_reveals_event_and_returns_to_administration(self):
        service = GameRoomService()
        user = User(id="user_1", username="Player One")
        state = {
            "mode": "goldfishing",
            "epoch": 1,
            "phase": "decay",
            "active_player_id": "player-1",
            "players": [{"id": "player-1", "name": "Player 1", "hand": ["lumber-camp"], "mana": {}, "passed": True}],
            "projects": [],
            "cities": [{"id": "capital", "name": "Capital", "cards": [], "exhausted_card_ids": []}],
            "event_deck": ["black-year"],
            "event_queue": [],
            "catalog": {
                "cards": [
                    {
                        "id": "lumber-camp",
                        "name": "Lumber Camp",
                        "kind": "cards",
                        "category": "institution",
                        "summary": "",
                        "color": None,
                        "data": {},
                    }
                ],
                "events": [
                    {
                        "id": "black-year",
                        "name": "The Black Year",
                        "kind": "events",
                        "category": "civil",
                        "summary": "",
                        "color": None,
                        "data": {},
                    }
                ],
                "tags": [],
            },
            "log": [],
        }

        room = await service.create_room(user=user, game_type="chronicle_solo", game_state=state)
        event_phase = await service.apply_goldfishing_action(
            room_id=room["id"],
            user=user,
            action="continue_phase",
            payload={},
        )
        self.assertEqual(event_phase["epoch"], 2)
        self.assertEqual(event_phase["phase"], "council")
        self.assertEqual(event_phase["event_queue"], ["black-year"])

        administration = await service.apply_goldfishing_action(room_id=room["id"], user=user, action="continue_phase", payload={})
        self.assertEqual(administration["phase"], "administration")
        self.assertFalse(administration["players"][0]["passed"])
        self.assertTrue(any(action["type"] == "propose_project" for action in administration["possible_actions"]))
