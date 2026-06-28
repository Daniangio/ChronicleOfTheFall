from __future__ import annotations

import re
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import GameCatalogEntryRecord, utc_now


CatalogKind = Literal[
    "tags",
    "cards",
    "ministries",
    "event-types",
    "agendas",
    "events",
    "groups",
    "card-categories",
    "decks",
]

CATALOG_KINDS: tuple[CatalogKind, ...] = (
    "tags",
    "cards",
    "ministries",
    "event-types",
    "agendas",
    "events",
    "groups",
    "card-categories",
    "decks",
)
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


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


def _sort_records(records: list[GameCatalogEntryRecord]) -> list[GameCatalogEntryRecord]:
    return sorted(records, key=lambda entry: (entry.kind, entry.category, entry.name, entry.id))


def list_catalog_records(db: Session, kind: CatalogKind | None = None) -> list[GameCatalogEntryRecord]:
    stmt = select(GameCatalogEntryRecord)
    if kind is not None:
        stmt = stmt.where(GameCatalogEntryRecord.kind == kind)
    return _sort_records(list(db.execute(stmt).scalars().all()))


def catalog_record_summary(db: Session) -> dict[str, int]:
    summary = {kind.replace("-", "_"): 0 for kind in CATALOG_KINDS}
    for entry in db.execute(select(GameCatalogEntryRecord.kind)).scalars().all():
        key = str(entry).replace("-", "_")
        if key in summary:
            summary[key] += 1
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
    _validate_catalog_data(db, kind=kind, entry_id=normalized_id, data=data or {})
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
    _validate_catalog_data(db, kind=kind, entry_id=row.id, data=data or {})
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


def _validate_catalog_data(db: Session, *, kind: CatalogKind, entry_id: str, data: dict[str, Any]) -> None:
    if kind != "ministries":
        return
    domain_id = str((data or {}).get("domain_id") or "").strip()
    if not domain_id:
        return
    for row in list_catalog_records(db, "ministries"):
        if row.id == entry_id:
            continue
        if str((row.data or {}).get("domain_id") or "").strip() == domain_id:
            raise ValueError("Ministry domain id must be unique.")


def delete_catalog_record(db: Session, *, kind: CatalogKind, entry_id: str) -> bool:
    row = get_catalog_record(db, kind=kind, entry_id=entry_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
