from sqlalchemy.orm import sessionmaker

from backend.app.database import Base, _build_engine
from backend.app.replay_service import replay_statistics, save_bot_replay


def test_bot_replay_persists_and_produces_distributions():
    engine = _build_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, future=True, expire_on_commit=False)
    state = {
        "room_id": "bot-room",
        "mode": "bots_only",
        "level_id": "level-one",
        "player_count": 3,
        "decks": {"foundation": "foundation"},
        "catalog": {
            "cards": [
                {"id": "capital", "name": "Capital", "kind": "cards", "category": "city", "data": {}},
                {"id": "farm", "name": "Farm", "kind": "cards", "category": "structure", "data": {}},
            ],
            "events": [
                {"id": "edict", "name": "Edict", "kind": "events", "category": "", "data": {"subtype": "edict"}},
                {"id": "crisis", "name": "Crisis", "kind": "events", "category": "", "data": {"subtype": "crisis"}},
            ],
            "tags": [{"id": "food", "name": "Food"}],
            "agendas": [{"id": "growth", "name": "Growth"}],
        },
        "replay_frames": [
            {
                "sequence": 0, "action": "setup", "era": 1, "phase": "plotting",
                "tags": {"food": 1},
                "cities": [{"id": "capital", "city_card_id": "capital", "cards": []}],
                "players": [{"id": "player-1", "agenda_id": "growth"}],
                "docket_resolution": [],
            },
            {
                "sequence": 1, "action": "reveal_next", "era": 1, "phase": "condition",
                "tags": {"food": 2},
                "cities": [{"id": "capital", "city_card_id": "capital", "cards": ["farm"]}],
                "players": [{"id": "player-1", "agenda_id": "growth"}],
                "docket_resolution": [
                    {"id": "one", "item_id": "edict", "status": "succeeded"},
                    {"id": "two", "item_id": "crisis", "status": "failed"},
                ],
                "agenda_results": {"player-1": {"score": 6}},
            },
        ],
        "era": 1,
        "phase": "game_over",
        "agenda_results": {"player-1": {"score": 6}},
        "winner_player_ids": ["player-1"],
    }

    with Session() as db:
        row = save_bot_replay(db, state=state, owner_user_id="owner")
        assert row is not None
        assert row.replay["catalog"]["game"]["cards"][1]["data"] == {}
        assert save_bot_replay(db, state=state, owner_user_id="owner").id == row.id
        statistics = replay_statistics([row], fallback_catalog={
            "tags": [{"id": "food", "name": "Food", "data": {"icon_image_id": "food-icon"}}],
        })

    assert statistics["game_count"] == 1
    assert statistics["tags_by_era"][0]["mean"] == 2
    assert statistics["structures_by_era"][0]["item_id"] == "farm"
    assert statistics["edicts_by_era"][0]["item_id"] == "edict"
    assert statistics["crises_by_era"][0]["item_id"] == "crisis"
    assert statistics["agenda_points"][0]["distribution"] == {"6": 1}
    assert statistics["catalog"]["tags"][0]["data"]["icon_image_id"] == "food-icon"
