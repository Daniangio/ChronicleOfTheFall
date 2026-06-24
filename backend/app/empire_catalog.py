from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import GameCatalogEntryRecord, utc_now


CatalogKind = Literal["tags", "cards", "roles", "agendas", "events"]


@dataclass(frozen=True)
class CatalogEntry:
    id: str
    name: str
    kind: CatalogKind
    category: str
    summary: str
    color: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


CATALOG_ENTRIES: tuple[CatalogEntry, ...] = (
    CatalogEntry(
        id="labor",
        name="Labor",
        kind="tags",
        category="mana",
        summary="Transient construction and workforce resource.",
        color="#b45309",
    ),
    CatalogEntry(
        id="wealth",
        name="Wealth",
        kind="tags",
        category="mana",
        summary="Transient capital, trade goods, and bribery resource.",
        color="#ca8a04",
    ),
    CatalogEntry(
        id="influence",
        name="Influence",
        kind="tags",
        category="mana",
        summary="Transient political, religious, and cultural resource.",
        color="#7c3aed",
    ),
    CatalogEntry(
        id="agrarian",
        name="Agrarian",
        kind="tags",
        category="state",
        summary="Persistent food production and land-use identity.",
        color="#16a34a",
        data={"scope": "local"},
    ),
    CatalogEntry(
        id="military",
        name="Military",
        kind="tags",
        category="state",
        summary="Persistent defensive and coercive state identity.",
        color="#dc2626",
        data={"scope": "local_or_global"},
    ),
    CatalogEntry(
        id="religion",
        name="Religion",
        kind="tags",
        category="state",
        summary="Persistent spiritual and cultural legitimacy identity.",
        color="#f59e0b",
        data={"scope": "global"},
    ),
    CatalogEntry(
        id="commerce",
        name="Commerce",
        kind="tags",
        category="state",
        summary="Persistent trade and market identity.",
        color="#0d9488",
        data={"scope": "local"},
    ),
    CatalogEntry(
        id="unrest",
        name="Unrest",
        kind="tags",
        category="condition",
        summary="Negative city condition placed by crises and overextension.",
        color="#be123c",
    ),
    CatalogEntry(
        id="famine",
        name="Famine",
        kind="tags",
        category="condition",
        summary="Negative city condition representing food collapse.",
        color="#a16207",
    ),
    CatalogEntry(
        id="infected",
        name="Infected",
        kind="tags",
        category="condition",
        summary="Negative city condition representing disease.",
        color="#65a30d",
    ),
    CatalogEntry(
        id="capital-foundation",
        name="Capital Foundation",
        kind="cards",
        category="foundation",
        summary="Starting city anchor for the empire map.",
        data={"placement": "setup", "is_capital": True},
    ),
    CatalogEntry(
        id="lumber-camp",
        name="Lumber Camp",
        kind="cards",
        category="institution",
        summary="Tier 1 local Agrarian institution that generates Labor.",
        data={"tier": 1, "cost": {"labor": 1}, "tags": ["agrarian"], "exhaust": {"labor": 1}},
    ),
    CatalogEntry(
        id="militia-garrison",
        name="Militia Garrison",
        kind="cards",
        category="institution",
        summary="Tier 1 local Military institution that generates Influence.",
        data={"tier": 1, "cost": {"wealth": 1}, "tags": ["military"], "exhaust": {"influence": 1}},
    ),
    CatalogEntry(
        id="grand-basilica",
        name="Grand Basilica",
        kind="cards",
        category="institution",
        summary="Tier 2 global Religion institution gated by stable city conditions.",
        data={
            "tier": 2,
            "cost": {"labor": 2, "wealth": 1},
            "tags": ["religion"],
            "scope": "global",
            "requires": ["no_unrest"],
            "exhaust": {"influence": 2},
        },
    ),
    CatalogEntry(
        id="market-hub",
        name="Market Hub",
        kind="cards",
        category="institution",
        summary="Tier 2 local Commerce institution that requires road access.",
        data={
            "tier": 2,
            "cost": {"labor": 1, "influence": 1},
            "tags": ["commerce"],
            "requires": ["connected_to_paved_road"],
            "exhaust": {"wealth": 2},
        },
    ),
    CatalogEntry(
        id="iron-citadel",
        name="The Iron Citadel",
        kind="cards",
        category="institution",
        summary="Tier 3 Military upgrade that suppresses unrest near the capital.",
        data={
            "tier": 3,
            "cost": {"labor": 2, "wealth": 2},
            "tags": ["military"],
            "scope": "global",
            "replaces": ["militia-garrison"],
            "exhaust": {"influence": 3},
        },
    ),
    CatalogEntry(
        id="paved-road",
        name="Paved Road",
        kind="cards",
        category="route",
        summary="Route that lets connected cities share Commerce tags.",
        data={"cost": {"labor": 1}, "tags": ["fast-travel"], "effect": "share_commerce"},
    ),
    CatalogEntry(
        id="mountain-pass",
        name="Mountain Pass",
        kind="cards",
        category="route",
        summary="Route that blocks condition propagation from event text.",
        data={"cost": {"labor": 2}, "tags": ["chokepoint"], "effect": "block_condition_spread"},
    ),
    CatalogEntry(
        id="minister-state",
        name="Minister of State",
        kind="roles",
        category="minister",
        summary="Resolves State Events and sets Administration turn order.",
        data={"jurisdiction": "state"},
    ),
    CatalogEntry(
        id="minister-war",
        name="Minister of War",
        kind="roles",
        category="minister",
        summary="Resolves Conflict Events and controls Military institution contributions.",
        data={"jurisdiction": "conflict", "default_jurisdiction": "military", "exhaust_tags": ["military"]},
    ),
    CatalogEntry(
        id="minister-interior",
        name="Minister of the Interior",
        kind="roles",
        category="minister",
        summary="Resolves Civil Events and can move one condition token each Administration phase.",
        data={"jurisdiction": "civil", "default_jurisdiction": "unrest"},
    ),
    CatalogEntry(
        id="minister-coin",
        name="Minister of Coin",
        kind="roles",
        category="minister",
        summary="Resolves Economy Events and can convert Commerce contributions into Influence.",
        data={"jurisdiction": "economy", "default_jurisdiction": "commerce", "exhaust_tags": ["commerce"]},
    ),
    CatalogEntry(
        id="merchant-syndicate",
        name="The Merchant Syndicate",
        kind="agendas",
        category="hidden-agenda",
        summary="Commerce tags must outnumber Unrest tokens at the end of the game.",
        data={"checks": ["commerce_gt_unrest"]},
    ),
    CatalogEntry(
        id="zealots",
        name="The Zealots",
        kind="agendas",
        category="hidden-agenda",
        summary="Every city must contain either Religion or Unrest.",
        data={"checks": ["each_city_religion_or_unrest"]},
    ),
    CatalogEntry(
        id="old-blood",
        name="The Old Blood",
        kind="agendas",
        category="hidden-agenda",
        summary="The capital must consolidate tier 3 institutions while frontier cities collapse.",
        data={"checks": ["capital_two_tier3", "two_frontiers_collapsed"]},
    ),
    CatalogEntry(
        id="black-year",
        name="The Black Year",
        kind="events",
        category="civil",
        summary="Famine targets the highest-capacity city and may add Unrest.",
        data={"mitigation": {"wealth": 2}},
    ),
    CatalogEntry(
        id="barbarian-incursion",
        name="Barbarian Incursion",
        kind="events",
        category="conflict",
        summary="Pressure hits the city furthest from the capital and spreads Unrest.",
        data={"mitigation": {"influence": 1, "wealth": 2}},
    ),
    CatalogEntry(
        id="shattered-crown",
        name="The Shattered Crown",
        kind="events",
        category="final-epoch",
        summary="Final Epoch collapse that removes Bureaucracy and punishes undefended cities.",
        data={"ends_game": True},
    ),
)

CATALOG_KINDS: tuple[CatalogKind, ...] = ("tags", "cards", "roles", "agendas", "events")
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def list_catalog_entries(kind: CatalogKind | None = None) -> list[CatalogEntry]:
    entries = list(CATALOG_ENTRIES)
    if kind is not None:
        entries = [entry for entry in entries if entry.kind == kind]
    return sorted(entries, key=lambda entry: (entry.kind, entry.category, entry.name))


def catalog_summary() -> dict[str, int]:
    summary = {kind: 0 for kind in ("tags", "cards", "roles", "agendas", "events")}
    for entry in CATALOG_ENTRIES:
        summary[entry.kind] += 1
    return summary


def normalize_catalog_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9-]+", "-", str(value or "").strip().casefold())
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    if not normalized:
        raise ValueError("Catalog id is required.")
    if len(normalized) > 128:
        raise ValueError("Catalog id must be 128 characters or fewer.")
    return normalized


def validate_catalog_kind(kind: str) -> CatalogKind:
    normalized = str(kind or "").strip()
    if normalized not in CATALOG_KINDS:
        raise ValueError("Unknown catalog kind.")
    return normalized  # type: ignore[return-value]


def validate_catalog_color(kind: str, color: str | None) -> str | None:
    normalized = str(color or "").strip()
    if not normalized:
        return None
    if kind != "tags":
        return None
    if not HEX_COLOR_RE.match(normalized):
        raise ValueError("Tag color must be a hex color like #0d9488.")
    return normalized.lower()


def seed_catalog_entries(db: Session) -> None:
    existing_rows = {
        row.id: row
        for row in db.execute(select(GameCatalogEntryRecord)).scalars().all()
    }
    changed = False
    for entry in CATALOG_ENTRIES:
        existing = existing_rows.get(entry.id)
        if existing is not None:
            if isinstance(existing.data, dict):
                missing_data = {
                    key: value
                    for key, value in entry.data.items()
                    if key not in existing.data
                }
                if missing_data:
                    existing.data = {**existing.data, **missing_data}
                    existing.updated_at = utc_now()
                    db.add(existing)
                    changed = True
            continue
        db.add(
            GameCatalogEntryRecord(
                id=entry.id,
                kind=entry.kind,
                name=entry.name,
                category=entry.category,
                summary=entry.summary,
                color=entry.color,
                data=entry.data,
            )
        )
        changed = True
    if changed:
        db.commit()


def _sort_records(records: list[GameCatalogEntryRecord]) -> list[GameCatalogEntryRecord]:
    return sorted(records, key=lambda entry: (entry.kind, entry.category, entry.name, entry.id))


def list_catalog_records(db: Session, kind: CatalogKind | None = None) -> list[GameCatalogEntryRecord]:
    stmt = select(GameCatalogEntryRecord)
    if kind is not None:
        stmt = stmt.where(GameCatalogEntryRecord.kind == kind)
    return _sort_records(list(db.execute(stmt).scalars().all()))


def catalog_record_summary(db: Session) -> dict[str, int]:
    summary = {kind: 0 for kind in CATALOG_KINDS}
    for entry in db.execute(select(GameCatalogEntryRecord.kind)).scalars().all():
        if entry in summary:
            summary[entry] += 1
    return summary


def get_catalog_record(db: Session, *, kind: CatalogKind, entry_id: str) -> GameCatalogEntryRecord | None:
    row = db.get(GameCatalogEntryRecord, normalize_catalog_id(entry_id))
    if row is None or row.kind != kind:
        return None
    return row


def create_catalog_record(
    db: Session,
    *,
    kind: CatalogKind,
    entry_id: str,
    name: str,
    category: str,
    summary: str,
    color: str | None,
    data: dict[str, Any],
) -> GameCatalogEntryRecord:
    normalized_id = normalize_catalog_id(entry_id)
    if db.get(GameCatalogEntryRecord, normalized_id) is not None:
        raise ValueError("A catalog entry with this id already exists.")
    row = GameCatalogEntryRecord(
        id=normalized_id,
        kind=kind,
        name=str(name or "").strip(),
        category=str(category or "").strip(),
        summary=str(summary or "").strip(),
        color=validate_catalog_color(kind, color),
        data=data or {},
    )
    if not row.name:
        raise ValueError("Name is required.")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_catalog_record(
    db: Session,
    *,
    kind: CatalogKind,
    entry_id: str,
    name: str,
    category: str,
    summary: str,
    color: str | None,
    data: dict[str, Any],
) -> GameCatalogEntryRecord | None:
    row = get_catalog_record(db, kind=kind, entry_id=entry_id)
    if row is None:
        return None
    row.name = str(name or "").strip()
    row.category = str(category or "").strip()
    row.summary = str(summary or "").strip()
    row.color = validate_catalog_color(kind, color)
    row.data = data or {}
    row.updated_at = utc_now()
    if not row.name:
        raise ValueError("Name is required.")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_catalog_record(db: Session, *, kind: CatalogKind, entry_id: str) -> bool:
    row = get_catalog_record(db, kind=kind, entry_id=entry_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
