#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = ROOT / "catalog"
CONTENT_ROOT = CATALOG_ROOT / "content"
OUTPUT_PATH = CATALOG_ROOT / "chronicle-catalog-all.json"
CONTENT_FILES = (
    ("cards", CONTENT_ROOT / "cards.json"),
    ("events", CONTENT_ROOT / "events.json"),
    ("agendas", CONTENT_ROOT / "agendas.json"),
    ("decks", CONTENT_ROOT / "decks.json"),
    ("levels", CONTENT_ROOT / "levels.json"),
)


def normalized_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9-]+", "-", value.strip().casefold())
    return re.sub(r"-+", "-", normalized).strip("-")


def main() -> None:
    entries: list[dict] = []
    kinds: list[str] = []
    seen_ids: set[str] = set()
    for expected_kind, path in CONTENT_FILES:
        document = json.loads(path.read_text(encoding="utf-8"))
        if document.get("version") != 1 or document.get("kind") != expected_kind:
            raise ValueError(f"{path} must be a version 1 {expected_kind!r} catalog.")
        source_entries = document.get("entries")
        if not isinstance(source_entries, list):
            raise ValueError(f"{path} must contain an entries list.")
        for entry in source_entries:
            if not isinstance(entry, dict) or entry.get("kind") != expected_kind:
                raise ValueError(f"Every entry in {path} must have kind {expected_kind!r}.")
            entry_id = normalized_id(str(entry.get("id") or ""))
            if not entry_id:
                raise ValueError(f"Every entry in {path} must have an id.")
            if entry_id in seen_ids:
                raise ValueError(f"Duplicate normalized catalog id {entry_id!r}.")
            seen_ids.add(entry_id)
            entries.append(entry)
        kinds.append(expected_kind)

    bundle = {
        "version": 1,
        "kind": "all",
        "catalog_kinds": kinds,
        "entries": entries,
    }
    OUTPUT_PATH.write_text(
        json.dumps(bundle, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(entries)} entries to {OUTPUT_PATH.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
