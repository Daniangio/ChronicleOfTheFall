from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from statistics import mean
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import GameReplayRecord


TERMINAL_DOCKET_STATUSES = {"built", "succeeded", "failed", "discarded", "not_founded"}


def _merge_catalog_entry(existing: dict[str, Any] | None, historical: dict[str, Any]) -> dict[str, Any]:
    merged = {**deepcopy(existing or {}), **deepcopy(historical)}
    merged["data"] = {
        **deepcopy((existing or {}).get("data") or {}),
        **deepcopy(historical.get("data") or {}),
    }
    return merged


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


def replay_statistics(
    rows: list[GameReplayRecord],
    *,
    fallback_catalog: dict[str, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    game_ids = [row.id for row in rows]
    tag_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    structure_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    edict_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    crisis_samples: dict[tuple[int, str], dict[str, int]] = defaultdict(dict)
    agenda_samples: dict[str, list[int]] = defaultdict(list)
    names: dict[str, str] = {}
    observed_eras: set[int] = set()
    catalog_entries: dict[str, dict[str, dict[str, Any]]] = {
        "tags": {},
        "structures": {},
        "edicts": {},
        "crises": {},
        "images": {},
        "pillars": {},
    }
    available_ids: dict[str, set[str]] = {
        "tags": set(),
        "structures": set(),
        "edicts": set(),
        "crises": set(),
    }
    for kind, entries in (fallback_catalog or {}).items():
        if kind not in catalog_entries:
            continue
        catalog_entries[kind].update({
            str(entry.get("id") or ""): deepcopy(entry)
            for entry in entries
            if entry.get("id")
        })

    for row in rows:
        replay = row.replay or {}
        frames = replay.get("frames") or []
        catalog = replay.get("catalog") or {}
        game_catalog = catalog.get("game") or {}
        items = {entry.get("id"): entry for entry in catalog.get("items", [])}
        names.update({entry.get("id", ""): entry.get("name", "") for entry in catalog.get("items", [])})
        names.update({entry.get("id", ""): entry.get("name", "") for entry in catalog.get("tags", [])})
        names.update({entry.get("id", ""): entry.get("name", "") for entry in catalog.get("agendas", [])})
        full_tags = game_catalog.get("tags", [])
        for entry in full_tags or catalog.get("tags", []):
            if entry.get("id"):
                if full_tags:
                    catalog_entries["tags"][entry["id"]] = _merge_catalog_entry(
                        catalog_entries["tags"].get(entry["id"]), entry
                    )
                else:
                    catalog_entries["tags"].setdefault(entry["id"], deepcopy(entry))
                available_ids["tags"].add(str(entry["id"]))
        for entry in game_catalog.get("images", []):
            if entry.get("id"):
                catalog_entries["images"][entry["id"]] = deepcopy(entry)
        for entry in game_catalog.get("pillars", []):
            if entry.get("id"):
                catalog_entries["pillars"][entry["id"]] = deepcopy(entry)
        historical_full_items = [*game_catalog.get("cards", []), *game_catalog.get("events", [])]
        full_items = historical_full_items or catalog.get("items", [])
        for entry in full_items:
            entry_id = str(entry.get("id") or "")
            if not entry_id:
                continue
            if entry.get("category") == "structure":
                if historical_full_items:
                    catalog_entries["structures"][entry_id] = _merge_catalog_entry(
                        catalog_entries["structures"].get(entry_id), entry
                    )
                else:
                    catalog_entries["structures"].setdefault(entry_id, deepcopy(entry))
                available_ids["structures"].add(entry_id)
            elif (entry.get("data") or {}).get("subtype") == "crisis" or entry.get("subtype") == "crisis":
                if historical_full_items:
                    catalog_entries["crises"][entry_id] = _merge_catalog_entry(
                        catalog_entries["crises"].get(entry_id), entry
                    )
                else:
                    catalog_entries["crises"].setdefault(entry_id, deepcopy(entry))
                available_ids["crises"].add(entry_id)
            elif entry.get("kind") == "events":
                if historical_full_items:
                    catalog_entries["edicts"][entry_id] = _merge_catalog_entry(
                        catalog_entries["edicts"].get(entry_id), entry
                    )
                else:
                    catalog_entries["edicts"].setdefault(entry_id, deepcopy(entry))
                available_ids["edicts"].add(entry_id)

        final_by_era: dict[int, dict[str, Any]] = {}
        replay_tag_ids = [str(entry.get("id") or "") for entry in catalog.get("tags", []) if entry.get("id")]
        previous_structures: Counter = Counter()
        seen_resolutions: set[str] = set()
        for frame in frames:
            era = int(frame.get("era") or 1)
            observed_eras.add(era)
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

    for era in observed_eras:
        for item_id in available_ids["structures"]:
            structure_samples.setdefault((era, item_id), {})
        for item_id in available_ids["edicts"]:
            edict_samples.setdefault((era, item_id), {})
        for item_id in available_ids["crises"]:
            crisis_samples.setdefault((era, item_id), {})

    return {
        "game_count": len(rows),
        "selected_replay_ids": game_ids,
        "catalog": {
            kind: list(entries.values())
            for kind, entries in catalog_entries.items()
        },
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
