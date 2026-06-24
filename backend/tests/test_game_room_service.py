import unittest

from backend.app.game_room_service import GameRoomService, ROOM_STATE_FINISHED, ROOM_STATE_IN_GAME
from backend.app.server_models import User


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
                        "data": {"cost": {"labor": 1}, "exhaust": {"labor": 1}},
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
            "projects": [],
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
                        "data": {"exhaust": {"labor": 1}},
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
