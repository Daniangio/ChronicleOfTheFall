from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from statistics import mean
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import GameReplayRecord


TERMINAL_DOCKET_STATUSES = {"built", "succeeded", "failed", "discarded", "not_founded"}


def build_replay_document(state: dict[str, Any]) -> dict[str, Any]:
    catalog = state.get("catalog", {})
    items = [*catalog.get("cards", []), *catalog.get("events", [])]
    return {
        "format": "chronicle-replay-v1",
        "room_id": state.get("room_id", ""),
        "mode": state.get("mode", ""),
        "level_id": state.get("level_id", ""),
        "player_count": int(state.get("player_count", 0)),
        "decks": deepcopy(state.get("decks", {})),
        "catalog": {
            "game": deepcopy(catalog),
            "items": [
                {
                    "id": item.get("id", ""),
                    "name": item.get("name", ""),
                    "kind": item.get("kind", ""),
                    "category": item.get("category", ""),
                    "subtype": (item.get("data") or {}).get("subtype", ""),
                }
                for item in items
            ],
            "tags": [
                {"id": entry.get("id", ""), "name": entry.get("name", "")}
                for entry in catalog.get("tags", [])
            ],
            "agendas": [
                {"id": entry.get("id", ""), "name": entry.get("name", "")}
                for entry in catalog.get("agendas", [])
            ],
        },
        "frames": deepcopy(state.get("replay_frames", [])),
        "final": {
            "era": int(state.get("era", 1)),
            "phase": state.get("phase", ""),
            "agenda_results": deepcopy(state.get("agenda_results", {})),
            "winner_player_ids": list(state.get("winner_player_ids", [])),
        },
    }


def save_bot_replay(db: Session, *, state: dict[str, Any], owner_user_id: str) -> GameReplayRecord | None:
    if state.get("mode") != "bots_only" or not state.get("replay_frames"):
        return None
    room_id = str(state.get("room_id") or "")
    existing = db.execute(select(GameReplayRecord).where(GameReplayRecord.room_id == room_id)).scalar_one_or_none()
    if existing is not None:
        return existing
    row = GameReplayRecord(
        room_id=room_id,
        owner_user_id=owner_user_id,
        mode="bots_only",
        level_id=str(state.get("level_id") or ""),
        player_count=int(state.get("player_count", 0)),
        replay=build_replay_document(state),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def replay_summary(row: GameReplayRecord) -> dict[str, Any]:
    replay = row.replay or {}
    final = replay.get("final") or {}
    return {
        "id": row.id,
        "room_id": row.room_id,
        "owner_user_id": row.owner_user_id,
        "mode": row.mode,
        "level_id": row.level_id,
        "player_count": int(row.player_count or 0),
        "era": int(final.get("era") or 0),
        "phase": final.get("phase") or "",
        "frame_count": len(replay.get("frames") or []),
        "created_at": row.created_at.isoformat(),
    }


def list_replays(db: Session, *, owner_user_id: str | None = None) -> list[GameReplayRecord]:
    statement = select(GameReplayRecord).order_by(GameReplayRecord.created_at.desc())
    if owner_user_id is not None:
        statement = statement.where(GameReplayRecord.owner_user_id == owner_user_id)
    return list(db.execute(statement).scalars().all())


def replay_statistics(rows: list[GameReplayRecord]) -> dict[str, Any]:
    game_ids = [row.id for row in rows]
    tag_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    structure_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    edict_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    crisis_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    agenda_samples: dict[str, list[int]] = defaultdict(list)
    names: dict[str, str] = {}

    for row in rows:
        replay = row.replay or {}
        frames = replay.get("frames") or []
        catalog = replay.get("catalog") or {}
        items = {entry.get("id"): entry for entry in catalog.get("items", [])}
        names.update({entry.get("id", ""): entry.get("name", "") for entry in catalog.get("items", [])})
        names.update({entry.get("id", ""): entry.get("name", "") for entry in catalog.get("tags", [])})
        names.update({entry.get("id", ""): entry.get("name", "") for entry in catalog.get("agendas", [])})

        final_by_era: dict[int, dict[str, Any]] = {}
        replay_tag_ids = [str(entry.get("id") or "") for entry in catalog.get("tags", []) if entry.get("id")]
        previous_structures: Counter = Counter()
        seen_resolutions: set[str] = set()
        for frame in frames:
            era = int(frame.get("era") or 1)
            final_by_era[era] = frame
            structures = Counter(
                card_id
                for city in frame.get("cities", [])
                for card_id in city.get("cards", [])
                if (items.get(card_id) or {}).get("category") == "structure"
            )
            for card_id, amount in (structures - previous_structures).items():
                structure_samples[(era, card_id)][row.id] = structure_samples[(era, card_id)].get(row.id, 0) + amount
            previous_structures = structures
            for resolution in frame.get("docket_resolution", []):
                resolution_id = str(resolution.get("id") or "")
                if not resolution_id or resolution_id in seen_resolutions or resolution.get("status") not in TERMINAL_DOCKET_STATUSES:
                    continue
                seen_resolutions.add(resolution_id)
                item_id = str(resolution.get("item_id") or "")
                item = items.get(item_id) or {}
                if item.get("kind") != "events":
                    continue
                target = crisis_samples if item.get("subtype") == "crisis" else edict_samples
                target[(era, item_id)][row.id] = target[(era, item_id)].get(row.id, 0) + 1

        for era, frame in final_by_era.items():
            frame_tags = frame.get("tags") or {}
            for tag_id in replay_tag_ids:
                tag_samples[(era, tag_id)][row.id] = int(frame_tags.get(tag_id, 0))

        final_frame = frames[-1] if frames else {}
        agenda_results = (replay.get("final") or {}).get("agenda_results") or final_frame.get("agenda_results") or {}
        for player in final_frame.get("players", []):
            agenda_id = str(player.get("agenda_id") or "")
            if agenda_id:
                agenda_samples[agenda_id].append(int((agenda_results.get(player.get("id")) or {}).get("score") or 0))

    return {
        "game_count": len(rows),
        "selected_replay_ids": game_ids,
        "tags_by_era": _metric_rows(tag_samples, game_ids, names),
        "structures_by_era": _metric_rows(structure_samples, game_ids, names),
        "edicts_by_era": _metric_rows(edict_samples, game_ids, names),
        "crises_by_era": _metric_rows(crisis_samples, game_ids, names),
        "agenda_points": [
            {"item_id": agenda_id, "name": names.get(agenda_id, agenda_id), **_distribution(values)}
            for agenda_id, values in sorted(agenda_samples.items())
        ],
    }


def _metric_rows(samples, game_ids: list[str], names: dict[str, str]) -> list[dict[str, Any]]:
    return [
        {
            "era": era,
            "item_id": item_id,
            "name": names.get(item_id, item_id),
            **_distribution([values.get(game_id, 0) for game_id in game_ids]),
        }
        for (era, item_id), values in sorted(samples.items())
    ]


def _distribution(values: list[int]) -> dict[str, Any]:
    histogram = Counter(int(value) for value in values)
    return {
        "samples": len(values),
        "mean": round(mean(values), 3) if values else 0,
        "distribution": {str(value): count for value, count in sorted(histogram.items())},
    }
