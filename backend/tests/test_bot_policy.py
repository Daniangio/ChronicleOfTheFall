from __future__ import annotations

import unittest

from backend.app.bot_policy import (
    _forecast_role_holder,
    advance_bot_players,
    choose_next_bot_action,
)
from backend.app.game_room_service import GameRoomService
from backend.app.goldfishing_engine import _prepare_state, perform_action
from backend.app.server_models import User
from backend.tests.test_game_room_service import (
    TEST_AGENDA_DATA,
    build_state,
    catalog_entry,
)


def agenda_for_tag(tag_id: str, *, resource_id: str = "labor") -> dict:
    data = {
        **TEST_AGENDA_DATA,
        "primary": {
            "name": f"{tag_id} legacy",
            "points": 4,
            "text": "",
            "conditions": [
                {"type": "tag_count", "tag": tag_id, "operator": "gte", "amount": 2}
            ],
        },
        "secondary": {
            "name": f"{resource_id} supply",
            "points": 2,
            "text": "",
            "conditions": [
                {"type": "production", "resource": resource_id, "operator": "gte", "amount": 2}
            ],
        },
    }
    return catalog_entry(f"{tag_id}-agenda", f"{tag_id} Agenda", "agendas", data=data)


def prepare_bot_state(*, player_count: int = 4) -> dict:
    state = build_state(
        mode="solo_bots",
        player_count=player_count,
        human_player_name="Human",
        auto_choose_agendas=False,
    )
    return advance_bot_players(state)


def advance_bot_until_selection(state: dict) -> tuple[dict, dict, list[dict]]:
    actions = []
    for _ in range(8):
        action = choose_next_bot_action(state)
        if action is None:
            raise AssertionError("Bot stopped before selecting a commitment.")
        actions.append(action)
        if action["type"] == "select_commit_card":
            return state, action, actions
        payload = {key: value for key, value in action.items() if key != "type"}
        state = perform_action(state, action["type"], payload)
        if action["type"] == "plotting_scheme" and action.get("mode") == "swap":
            player = next(player for player in state["players"] if player["id"] == action["player_id"])
            player["bot_scheme_adjusted_era"] = state["era"]
    raise AssertionError("Bot did not select a commitment within the action limit.")


class TestBotPolicy(unittest.TestCase):
    def test_variable_player_setup_creates_one_human_and_remaining_bots(self):
        for player_count in (3, 4, 5):
            with self.subTest(player_count=player_count):
                state = prepare_bot_state(player_count=player_count)

                self.assertEqual(len(state["players"]), player_count)
                self.assertEqual(state["player_count"], player_count)
                self.assertEqual(state["players"][0]["controller"], "human")
                self.assertTrue(all(
                    player["controller"] == "bot"
                    for player in state["players"][1:]
                ))
                self.assertTrue(all(
                    player["hidden_agenda_id"]
                    for player in state["players"][1:]
                ))
                self.assertFalse(state["players"][0]["hidden_agenda_id"])

    def test_bots_commit_when_empty_city_row_skips_council_vote(self):
        state = prepare_bot_state()
        human_agenda = next(
            action
            for action in state["possible_actions"]
            if action.get("player_id") == "player-1"
        )
        state = advance_bot_players(
            perform_action(state, human_agenda["type"], human_agenda)
        )
        self.assertEqual(state["phase"], "plotting")
        self.assertEqual(state["council_votes"], {})
        self.assertTrue(all(player["committed"] for player in state["players"][1:]))
        self.assertFalse(state["players"][0]["committed"])

    def test_system_steps_advance_until_the_human_has_a_decision(self):
        state = prepare_bot_state()
        human_agenda = next(
            action
            for action in state["possible_actions"]
            if action.get("player_id") == "player-1"
        )
        state = advance_bot_players(
            perform_action(state, human_agenda["type"], human_agenda)
        )
        human_commit = next(
            action
            for action in state["possible_actions"]
            if action.get("player_id") == "player-1"
            and action["type"] == "select_commit_card"
        )

        state = advance_bot_players(
            perform_action(state, human_commit["type"], human_commit)
        )
        human_confirm = next(
            action
            for action in state["possible_actions"]
            if action.get("player_id") == "player-1"
            and action["type"] == "confirm_plotting"
        )
        state = advance_bot_players(
            perform_action(state, human_confirm["type"], human_confirm)
        )

        self.assertEqual(state["phase"], "docket_ordering")
        self.assertTrue(state["possible_actions"])
        self.assertTrue(all(
            action.get("player_id") == "player-1"
            for action in state["possible_actions"]
        ))

    def test_bot_commits_card_that_matches_its_agenda(self):
        military_agenda = agenda_for_tag("military")
        state = prepare_bot_state()
        state["catalog"]["agendas"].append(military_agenda)
        bot = state["players"][1]
        bot["hidden_agenda_id"] = military_agenda["id"]
        bot["hand"] = ["farm", "garrison"]
        bot["scheme_slots"] = [None, None]
        bot["committed"] = False
        state["phase"] = "plotting"
        state["active_player_id"] = ""
        state["global_resource_pool"] = {"labor": 2}
        for player in state["players"]:
            if player["id"] != bot["id"]:
                player["committed"] = True
        state = _prepare_state(state)

        _, action, _ = advance_bot_until_selection(state)

        self.assertEqual(action["type"], "select_commit_card")
        self.assertEqual(action["item_id"], "garrison")

    def test_bot_plays_prerequisite_tag_that_unlocks_high_value_card(self):
        industry_seed = catalog_entry(
            "industry-seed",
            "Industry Seed",
            "cards",
            category="structure",
            data={
                "required_tags": {},
                "cost": {"labor": 1},
                "tags": {"industry": 1},
                "production": {},
            },
        )
        academy = catalog_entry(
            "industrial-academy",
            "Industrial Academy",
            "cards",
            category="structure",
            data={
                "required_tags": {"industry": 1},
                "cost": {"labor": 1},
                "tags": {"science": 2},
                "production": {"knowledge": 1},
            },
        )
        science_agenda = agenda_for_tag("science", resource_id="knowledge")
        state = prepare_bot_state()
        state["catalog"]["cards"].extend([industry_seed, academy])
        state["catalog"]["agendas"].append(science_agenda)
        bot = state["players"][1]
        bot["hidden_agenda_id"] = science_agenda["id"]
        bot["hand"] = ["farm", "industry-seed"]
        bot["scheme_slots"] = [None, None]
        bot["committed"] = False
        state["phase"] = "plotting"
        state["active_player_id"] = ""
        state["global_resource_pool"] = {"labor": 2}
        for player in state["players"]:
            if player["id"] != bot["id"]:
                player["committed"] = True
        state = _prepare_state(state)

        _, action, _ = advance_bot_until_selection(state)

        self.assertEqual(action["type"], "select_commit_card")
        self.assertEqual(action["item_id"], "industry-seed")

    def test_bot_fills_both_scheme_slots_and_prioritizes_a_crisis(self):
        military_agenda = agenda_for_tag("military")
        state = prepare_bot_state()
        state["catalog"]["agendas"].append(military_agenda)
        bot = state["players"][1]
        bot["hidden_agenda_id"] = military_agenda["id"]
        bot["hand"] = ["farm", "garrison", "tax-riots", "border-raid"]
        bot["scheme_slots"] = [None, None]
        bot["committed"] = False
        state["phase"] = "plotting"
        state["active_player_id"] = ""
        state["global_resource_pool"] = {"labor": 2}
        for player in state["players"]:
            if player["id"] != bot["id"]:
                player["committed"] = True
        state = _prepare_state(state)

        state, action, actions = advance_bot_until_selection(state)
        updated_bot = next(player for player in state["players"] if player["id"] == bot["id"])

        self.assertEqual(action["item_id"], "garrison")
        self.assertTrue(all(updated_bot["scheme_slots"]))
        self.assertIn("border-raid", updated_bot["scheme_slots"])
        self.assertGreaterEqual(
            sum(candidate["type"] == "plotting_scheme" for candidate in actions),
            2,
        )

    def test_bot_prefers_crisis_for_the_last_empty_scheme_slot(self):
        military_agenda = agenda_for_tag("military")
        state = prepare_bot_state()
        state["catalog"]["agendas"].append(military_agenda)
        bot = state["players"][1]
        bot["hidden_agenda_id"] = military_agenda["id"]
        bot["hand"] = ["garrison", "tax-riots", "border-raid"]
        bot["scheme_slots"] = ["farm", None]
        bot["committed"] = False
        state["phase"] = "plotting"
        state["active_player_id"] = ""
        state["global_resource_pool"] = {"labor": 2}
        for player in state["players"]:
            if player["id"] != bot["id"]:
                player["committed"] = True
        state = _prepare_state(state)

        action = choose_next_bot_action(state)

        self.assertEqual(action["type"], "plotting_scheme")
        self.assertEqual(action["mode"], "to_scheme")
        self.assertEqual(action["hand_index"], 2)
        self.assertEqual(action["slot_index"], 1)

    def test_bot_schemes_valuable_card_expected_within_three_eras(self):
        academy = catalog_entry(
            "academy",
            "Academy",
            "cards",
            category="structure",
            data={
                "required_tags": {"food": 1},
                "cost": {"labor": 1},
                "tags": {"science": 2},
                "production": {"knowledge": 1},
            },
        )
        science_agenda = agenda_for_tag("science", resource_id="knowledge")
        state = prepare_bot_state()
        state["catalog"]["cards"].append(academy)
        state["catalog"]["agendas"].append(science_agenda)
        bot = state["players"][1]
        bot["hidden_agenda_id"] = science_agenda["id"]
        bot["hand"] = ["academy", "farm"]
        bot["scheme_slots"] = [None, None]
        bot["committed"] = False
        state["phase"] = "plotting"
        state["active_player_id"] = ""
        state["global_resource_pool"] = {"labor": 2}
        for player in state["players"]:
            if player["id"] != bot["id"]:
                player["committed"] = True
        state = _prepare_state(state)

        action = choose_next_bot_action(state)

        self.assertEqual(action["type"], "plotting_scheme")
        self.assertEqual(action["mode"], "to_scheme")
        self.assertEqual(action["hand_index"], 0)

    def test_resource_choice_uses_agenda_board_value(self):
        knowledge_agenda = agenda_for_tag("military", resource_id="knowledge")
        state = prepare_bot_state()
        state["catalog"]["agendas"].append(knowledge_agenda)
        bot = state["players"][1]
        bot["hidden_agenda_id"] = knowledge_agenda["id"]
        state["phase"] = "reveal"
        state["active_player_id"] = bot["id"]
        state["possible_actions"] = [
            {
                "type": "choose_event_resource",
                "player_id": bot["id"],
                "resource_id": resource_id,
                "amount": 1,
            }
            for resource_id in ("labor", "knowledge")
        ]

        action = choose_next_bot_action(state)

        self.assertEqual(action["resource_id"], "knowledge")

    def test_ministry_forecast_tracks_state_holder_rotating_into_war(self):
        state = prepare_bot_state()
        current_state_holder = _forecast_role_holder(state, "state", 0)

        self.assertEqual(
            _forecast_role_holder(state, "war", 1),
            current_state_holder,
        )


class TestBotRoomService(unittest.IsolatedAsyncioTestCase):
    async def test_service_advances_bots_and_redacts_private_state(self):
        service = GameRoomService()
        user = User(id="user-1", username="Human")
        room = await service.create_room(
            user=user,
            game_type="chronicle_solo",
            game_state=build_state(
                mode="solo_bots",
                player_count=3,
                human_player_name="Human",
                auto_choose_agendas=False,
            ),
        )

        public = await service.get_game_state(room_id=room["id"], user=user)

        self.assertEqual(public["phase"], "agenda_selection")
        self.assertEqual(len(public["possible_actions"]), 2)
        self.assertTrue(public["players"][1]["agenda_selected"])
        self.assertEqual(public["players"][1]["hidden_agenda_id"], "")
        self.assertEqual(public["players"][1]["hand"], [])
        self.assertGreater(public["players"][1]["hand_count"], 0)

    async def test_service_rejects_actions_for_bot_seats(self):
        service = GameRoomService()
        user = User(id="user-1", username="Human")
        room = await service.create_room(
            user=user,
            game_type="chronicle_solo",
            game_state=build_state(
                mode="solo_bots",
                player_count=3,
                human_player_name="Human",
                auto_choose_agendas=False,
            ),
        )

        with self.assertRaisesRegex(ValueError, "cannot perform an action for a bot"):
            await service.apply_goldfishing_action(
                room_id=room["id"],
                user=user,
                action="choose_agenda",
                payload={"player_id": "player-2", "agenda_id": "survivor"},
            )
