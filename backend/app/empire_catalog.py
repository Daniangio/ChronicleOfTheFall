from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import GameCatalogEntryRecord, utc_now


CatalogKind = Literal[
    "tags",
    "images",
    "cards",
    "ministries",
    "pillars",
    "tokens",
    "effect-icons",
    "agendas",
    "events",
    "decks",
    "levels",
]

CATALOG_KINDS: tuple[CatalogKind, ...] = (
    "tags",
    "images",
    "cards",
    "ministries",
    "pillars",
    "tokens",
    "effect-icons",
    "agendas",
    "events",
    "decks",
    "levels",
)
STATIC_CATALOG_KINDS: tuple[CatalogKind, ...] = (
    "tags",
    "images",
    "ministries",
    "pillars",
    "tokens",
    "effect-icons",
)
DYNAMIC_CATALOG_KINDS: tuple[CatalogKind, ...] = tuple(
    kind for kind in CATALOG_KINDS if kind not in STATIC_CATALOG_KINDS
)
STATIC_CATALOG_ROOT = Path(__file__).resolve().parents[2] / "catalog" / "ingredients"
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
AGENDA_CONDITION_TYPES = {
    "tag_count",
    "tag_compare",
    "tag_sum_compare",
    "production",
    "capacity",
    "collapsed_pillar",
    "not_collapsed_pillar",
    "highest_surviving_pillar",
    "token_count",
    "tag_plus_token_count",
    "no_city_has_plague_exceeding_sanitary",
    "distinct_tags_at_least",
    "all_tags_at_most",
    "tag_is_highest",
}


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


def load_static_catalog_entries() -> list[dict[str, Any]]:
    if not STATIC_CATALOG_ROOT.is_dir():
        raise RuntimeError(f"Static catalog directory does not exist: {STATIC_CATALOG_ROOT}")
    entries: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    loaded_kinds: set[str] = set()
    for path in sorted(STATIC_CATALOG_ROOT.glob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Cannot load static catalog {path}: {exc}") from exc
        kind = str(document.get("kind") or "").strip()
        if kind not in STATIC_CATALOG_KINDS:
            raise RuntimeError(f"Static catalog {path} has unsupported kind {kind!r}.")
        if kind in loaded_kinds:
            raise RuntimeError(f"Static catalog kind {kind!r} is declared more than once.")
        loaded_kinds.add(kind)
        document_entries = document.get("entries")
        if not isinstance(document_entries, list):
            raise RuntimeError(f"Static catalog {path} must contain an entries list.")
        for raw_entry in document_entries:
            if not isinstance(raw_entry, dict) or raw_entry.get("kind") != kind:
                raise RuntimeError(f"Every entry in {path} must have kind {kind!r}.")
            entry_id = normalize_catalog_id(str(raw_entry.get("id") or ""))
            if entry_id in seen_ids:
                raise RuntimeError(f"Duplicate static catalog id: {entry_id}")
            seen_ids.add(entry_id)
            entries.append({**raw_entry, "id": entry_id})
    missing_kinds = set(STATIC_CATALOG_KINDS) - loaded_kinds
    if missing_kinds:
        raise RuntimeError(f"Missing static catalog files for: {', '.join(sorted(missing_kinds))}.")
    return entries


def static_effect_types() -> set[str]:
    return {
        str((entry.get("data") or {}).get("effect_type") or "")
        for entry in load_static_catalog_entries()
        if entry.get("kind") == "effect-icons"
    }


def sync_static_catalog_records(db: Session) -> None:
    desired_entries = load_static_catalog_entries()
    desired_by_id = {entry["id"]: entry for entry in desired_entries}
    existing_static = list(
        db.execute(
            select(GameCatalogEntryRecord).where(GameCatalogEntryRecord.kind.in_(STATIC_CATALOG_KINDS))
        ).scalars().all()
    )
    changed = False
    for row in existing_static:
        if row.id not in desired_by_id:
            db.delete(row)
            changed = True
    for entry_id, entry in desired_by_id.items():
        kind = validate_catalog_kind(str(entry["kind"]))
        data = entry.get("data") or {}
        _validate_catalog_data(
            db,
            kind=kind,
            entry_id=entry_id,
            category=str(entry.get("category") or ""),
            data=data,
        )
        values = {
            "kind": kind,
            "name": str(entry.get("name") or "").strip(),
            "category": _catalog_category(kind, str(entry.get("category") or ""), data),
            "summary": str(entry.get("summary") or "").strip(),
            "color": validate_catalog_color(kind, entry.get("color")),
            "data": data,
        }
        if not values["name"]:
            raise RuntimeError(f"Static catalog entry {entry_id} has no name.")
        row = db.get(GameCatalogEntryRecord, entry_id)
        if row is not None and row.kind not in STATIC_CATALOG_KINDS:
            raise RuntimeError(
                f"Static catalog id {entry_id} conflicts with dynamic entry {row.kind}:{row.id}."
            )
        if row is None:
            row = GameCatalogEntryRecord(id=entry_id, **values)
            db.add(row)
            changed = True
            continue
        if any(getattr(row, field) != value for field, value in values.items()):
            for field, value in values.items():
                setattr(row, field, value)
            row.updated_at = utc_now()
            db.add(row)
            changed = True
    if changed:
        db.commit()


def list_catalog_records(db: Session, kind: CatalogKind | None = None) -> list[GameCatalogEntryRecord]:
    if kind is None or kind in STATIC_CATALOG_KINDS:
        sync_static_catalog_records(db)
    stmt = select(GameCatalogEntryRecord)
    if kind is not None:
        stmt = stmt.where(GameCatalogEntryRecord.kind == kind)
    return _sort_records(list(db.execute(stmt).scalars().all()))


def catalog_record_summary(db: Session) -> dict[str, int]:
    sync_static_catalog_records(db)
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
    if kind in STATIC_CATALOG_KINDS:
        raise ValueError(f"{kind} are repository-owned and cannot be created from the admin console.")
    normalized_id = normalize_catalog_id(entry_id)
    existing = db.get(GameCatalogEntryRecord, normalized_id)
    if existing is not None:
        raise ValueError(f"A catalog entry with this id already exists as {existing.kind}:{existing.id}.")
    normalized_data = data or {}
    _validate_catalog_data(
        db,
        kind=kind,
        entry_id=normalized_id,
        category=category,
        data=normalized_data,
    )
    row = GameCatalogEntryRecord(
        id=normalized_id,
        kind=kind,
        name=str(name or "").strip(),
        category=_catalog_category(kind, category, normalized_data),
        summary=str(summary or "").strip(),
        color=validate_catalog_color(kind, color),
        data=normalized_data,
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
    new_entry_id: str | None = None,
    name: str,
    category: str,
    summary: str,
    color: str | None,
    data: dict[str, Any],
) -> GameCatalogEntryRecord | None:
    if kind in STATIC_CATALOG_KINDS:
        raise ValueError(f"{kind} are repository-owned and cannot be edited from the admin console.")
    row = get_catalog_record(db, kind=kind, entry_id=entry_id)
    if row is None:
        return None
    normalized_id = row.id if new_entry_id is None else normalize_catalog_id(new_entry_id or name)
    existing = db.get(GameCatalogEntryRecord, normalized_id)
    if existing is not None and existing.id != row.id:
        raise ValueError(f"A catalog entry with this id already exists as {existing.kind}:{existing.id}.")
    normalized_data = data or {}
    _validate_catalog_data(
        db,
        kind=kind,
        entry_id=normalized_id,
        category=category,
        data=normalized_data,
    )
    row.id = normalized_id
    row.name = str(name or "").strip()
    row.category = _catalog_category(kind, category, normalized_data)
    row.summary = str(summary or "").strip()
    row.color = validate_catalog_color(kind, color)
    row.data = normalized_data
    row.updated_at = utc_now()
    if not row.name:
        raise ValueError("Name is required.")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _validate_catalog_data(
    db: Session,
    *,
    kind: CatalogKind,
    entry_id: str,
    category: str,
    data: dict[str, Any],
) -> None:
    if kind == "tags":
        resource_type = str((data or {}).get("resource_type") or "").strip()
        if resource_type not in {"permanent", "volatile"}:
            raise ValueError("Tag resource_type must be either permanent or volatile.")
        return
    if kind == "cards":
        card_category = str(category or "").strip()
        if card_category not in {"city", "structure"}:
            raise ValueError("Card category must be city or structure.")
        if "card_type" in data:
            raise ValueError("Development Type was removed; use the card category.")
        if card_category == "city" and int(data.get("building_slots") or 0) < 0:
            raise ValueError("City building slots cannot be negative.")
        _validate_count_map(data.get("required_tags"), "required_tags")
        _validate_count_map(data.get("cost"), "cost")
        _validate_count_map(data.get("tags"), "tags")
        _validate_count_map(data.get("production"), "production")
        _validate_card_effects(data.get("on_build_effects"), trigger="on_build")
        _validate_card_effects(data.get("persistent_effects"), trigger="persistent")
        return
    if kind == "events":
        obsolete_fields = {
            "image",
            "image_id",
            "effects",
            "success_effects",
            "failure_effects",
            "defense_requirement",
            "thresholds",
            "ministry_symbol",
            "domain_id",
        }
        present_obsolete_fields = sorted(obsolete_fields.intersection(data))
        if present_obsolete_fields:
            raise ValueError(
                f"Obsolete event fields are not supported: {', '.join(present_obsolete_fields)}."
            )
        if str(data.get("subtype") or "") not in {"edict", "crisis"}:
            raise ValueError("Event subtype must be edict or crisis.")
        _validate_event_requirements(data.get("requirements"))
        _validate_event_effects(data.get("main_effects"))
        _validate_event_effects(data.get("alternative_effects"))
        return
    if kind == "agendas":
        _validate_agenda(data)
        return
    if kind == "effect-icons":
        effect_type = str(data.get("effect_type") or "")
        valid_effects = static_effect_types()
        if effect_type not in valid_effects:
            raise ValueError("Effect icon code is not supported.")
        return
    if kind == "decks":
        deck_type = str(data.get("deck_type") or "")
        if deck_type not in {"foundation", "institution", "crisis"}:
            raise ValueError("Deck type must be foundation, institution, or crisis.")
        item_ids = data.get("item_ids")
        if not isinstance(item_ids, list):
            raise ValueError("Deck item_ids must be a list.")
        deck_counts: dict[str, int] = {}
        for item_id in item_ids:
            deck_counts[str(item_id)] = deck_counts.get(str(item_id), 0) + 1
        for item_id in deck_counts:
            item = db.get(GameCatalogEntryRecord, item_id)
            event_subtype = str((item.data or {}).get("subtype") or "") if item and item.kind == "events" else ""
            is_crisis = item is not None and item.kind == "events" and event_subtype == "crisis"
            is_development = item is not None and (
                (item.kind == "cards" and item.category == "structure")
                or (item.kind == "events" and event_subtype == "edict")
            )
            if deck_type == "crisis" and not is_crisis:
                raise ValueError(f"Crisis deck item {item_id} is not a Crisis card.")
            if deck_type in {"foundation", "institution"} and not is_development:
                raise ValueError(
                    f"{deck_type.title()} deck item {item_id} is not a Structure or Edict card."
                )
        if deck_type == "foundation":
            initial_setup = data.get("initial_setup")
            if not isinstance(initial_setup, dict):
                raise ValueError("Foundation deck initial_setup must contain 3+, 4+, and 5-player tiers.")
            expected_tier_sizes = {"3": 6, "4": 2, "5": 2}
            setup_ids: list[str] = []
            for player_count, expected_size in expected_tier_sizes.items():
                tier = initial_setup.get(player_count)
                if not isinstance(tier, list) or len(tier) != expected_size:
                    raise ValueError(
                        f"The {player_count}{'+' if player_count != '5' else ''} initial setup tier "
                        f"must contain exactly {expected_size} cards."
                    )
                setup_ids.extend(str(item_id) for item_id in tier)
            setup_counts: dict[str, int] = {}
            for item_id in setup_ids:
                setup_counts[item_id] = setup_counts.get(item_id, 0) + 1
            if any(count > deck_counts.get(item_id, 0) for item_id, count in setup_counts.items()):
                raise ValueError("Initial setup copies must also exist in the Foundation deck.")
        elif data.get("initial_setup") not in (None, {}):
            raise ValueError("Only Foundation decks support an initial setup.")
        return
    if kind == "levels":
        city_id = str(data.get("initial_city_card_id") or "")
        foundation_deck_id = str(data.get("foundation_deck_id") or "")
        institution_deck_id = str(data.get("institution_deck_id") or "")
        crisis_deck_id = str(data.get("crisis_deck_id") or "")
        if not city_id:
            raise ValueError("A level requires an initial city card.")
        if not foundation_deck_id:
            raise ValueError("A level requires a Foundation deck.")
        if not institution_deck_id:
            raise ValueError("A level requires an Institution deck.")
        if not crisis_deck_id:
            raise ValueError("A level requires a Crisis deck.")
        suspicion_start_era = int(data.get("suspicion_start_era") or 5)
        if suspicion_start_era < 1:
            raise ValueError("Suspicion start Era must be at least 1.")
        city = db.get(GameCatalogEntryRecord, city_id)
        if city is None or city.kind != "cards" or city.category != "city":
            raise ValueError("The initial City must reference a City card.")
        for label, deck_id, expected_type in (
            ("Foundation", foundation_deck_id, "foundation"),
            ("Institution", institution_deck_id, "institution"),
        ):
            deck = db.get(GameCatalogEntryRecord, deck_id)
            if (
                deck is None
                or deck.kind != "decks"
                or str((deck.data or {}).get("deck_type") or "") != expected_type
            ):
                raise ValueError(f"The level {label} deck must reference a {label} deck.")
        crisis_deck = db.get(GameCatalogEntryRecord, crisis_deck_id)
        if (
            crisis_deck is None
            or crisis_deck.kind != "decks"
            or str((crisis_deck.data or {}).get("deck_type") or "") != "crisis"
        ):
            raise ValueError("The level Crisis deck must reference a Crisis deck.")
        city_pool_ids = data.get("city_pool_card_ids")
        if not isinstance(city_pool_ids, list):
            raise ValueError("A level city_pool_card_ids value must be a list.")
        unique_city_pool_ids = list(dict.fromkeys(str(item_id) for item_id in city_pool_ids))
        if city_id in unique_city_pool_ids:
            raise ValueError("The initial City cannot also be in the City Charter pool.")
        for pool_city_id in unique_city_pool_ids:
            pool_city = db.get(GameCatalogEntryRecord, pool_city_id)
            if pool_city is None or pool_city.kind != "cards" or pool_city.category != "city":
                raise ValueError(f"City Charter {pool_city_id} must reference a City card.")
        available_city_count = int(data.get("available_city_count") or 0)
        if available_city_count < 0 or available_city_count > len(unique_city_pool_ids):
            raise ValueError("Available City count must fit within the City Charter pool.")


def _validate_count_map(value: Any, field: str) -> None:
    if value in (None, {}):
        return
    if not isinstance(value, dict):
        raise ValueError(f"Card {field} must be an object of item counts.")
    if any(not str(item_id) or int(count) < 1 for item_id, count in value.items()):
        raise ValueError(f"Card {field} counts must be positive integers.")


def _validate_agenda(data: dict[str, Any]) -> None:
    if int(data.get("max_points") or 0) != 8:
        raise ValueError("Agenda max_points must be 8.")
    if int(data.get("win_threshold") or 0) != 6:
        raise ValueError("Agenda win_threshold must be 6.")
    if data.get("forbidden_is_veto") is True:
        raise ValueError("Agenda Forbidden Future is a -1 point penalty, not a veto.")
    ingredients = load_static_catalog_entries()
    permanent_tag_ids = {
        str(entry["id"])
        for entry in ingredients
        if entry["kind"] == "tags" and (entry.get("data") or {}).get("resource_type") == "permanent"
    }
    resource_ids = {
        str(entry["id"])
        for entry in ingredients
        if entry["kind"] == "tags" and (entry.get("data") or {}).get("resource_type") == "volatile"
    }
    pillar_ids = {str(entry["id"]) for entry in ingredients if entry["kind"] == "pillars"}
    expected_points = {"primary": 4, "secondary": 2, "collapse": 2, "forbidden": -1}
    for section_name, points in expected_points.items():
        section = data.get(section_name)
        if not isinstance(section, dict):
            raise ValueError(f"Agenda {section_name} section is required.")
        if not str(section.get("name") or "").strip():
            raise ValueError(f"Agenda {section_name} name is required.")
        if int(section.get("points") or 0) != points:
            raise ValueError(f"Agenda {section_name} must be worth {points} points.")
        conditions = section.get("conditions")
        if not isinstance(conditions, list) or not conditions:
            raise ValueError(f"Agenda {section_name} requires at least one condition.")
        for condition in conditions:
            _validate_agenda_condition(
                condition,
                permanent_tag_ids=permanent_tag_ids,
                resource_ids=resource_ids,
                pillar_ids=pillar_ids,
            )


def _validate_agenda_condition(
    condition: Any,
    *,
    permanent_tag_ids: set[str],
    resource_ids: set[str],
    pillar_ids: set[str],
) -> None:
    if not isinstance(condition, dict):
        raise ValueError("Agenda conditions must be objects.")
    condition_type = str(condition.get("type") or "")
    if condition_type not in AGENDA_CONDITION_TYPES:
        raise ValueError(f"Unsupported Agenda condition type: {condition_type or 'missing'}.")
    comparison_types = {
        "tag_count",
        "tag_compare",
        "tag_sum_compare",
        "production",
        "capacity",
        "token_count",
        "tag_plus_token_count",
    }
    if condition_type in comparison_types and condition.get("operator") not in {"gt", "gte", "lt", "lte", "eq"}:
        raise ValueError(f"Agenda {condition_type} requires a valid comparison.")
    if condition_type in {"tag_count", "tag_is_highest", "tag_plus_token_count"}:
        if str(condition.get("tag") or "") not in permanent_tag_ids:
            raise ValueError(f"Agenda {condition_type} must reference an existing permanent tag.")
    if condition_type == "tag_compare" and (
        str(condition.get("left") or "") not in permanent_tag_ids
        or str(condition.get("right") or "") not in permanent_tag_ids
    ):
        raise ValueError("Agenda tag_compare must reference existing permanent tags.")
    if condition_type == "tag_sum_compare" and (
        not condition.get("left_tags") or not condition.get("right_tags")
    ):
        raise ValueError("Agenda tag_sum_compare requires left_tags and right_tags.")
    if condition_type == "tag_sum_compare" and any(
        str(tag_id) not in permanent_tag_ids
        for tag_id in [*condition.get("left_tags", []), *condition.get("right_tags", [])]
    ):
        raise ValueError("Agenda tag_sum_compare must reference existing permanent tags.")
    if condition_type in {"production", "capacity"} and str(condition.get("resource") or "") not in resource_ids:
        raise ValueError(f"Agenda {condition_type} must reference an existing volatile resource.")
    if (
        condition_type in {"collapsed_pillar", "not_collapsed_pillar", "highest_surviving_pillar"}
        and str(condition.get("pillar") or "") not in pillar_ids
    ):
        raise ValueError(f"Agenda {condition_type} must reference an existing Pillar.")
    if condition_type in {"token_count", "tag_plus_token_count"}:
        if str(condition.get("token") or "") not in {"plague", "global_unrest", "fortified"}:
            raise ValueError(f"Agenda {condition_type} requires a supported token.")
        if str(condition.get("scope") or "") != "empire":
            raise ValueError(f"Agenda {condition_type} scope must be empire.")
    if condition_type in {"distinct_tags_at_least", "all_tags_at_most"}:
        tags = condition.get("tags")
        if not isinstance(tags, list) or not tags:
            raise ValueError(f"Agenda {condition_type} requires tags.")
        if any(str(tag_id) not in permanent_tag_ids for tag_id in tags):
            raise ValueError(f"Agenda {condition_type} must reference existing permanent tags.")


def _validate_card_effects(value: Any, *, trigger: str) -> None:
    effects = value or []
    if not isinstance(effects, list):
        raise ValueError(f"Card {trigger} effects must be a list.")
    allowed = {"modify_pillar", "modify_token"} if trigger == "on_build" else {"add_building_slots", "storage"}
    token_ids = {
        str(entry.get("id") or "")
        for entry in load_static_catalog_entries()
        if entry.get("kind") == "tokens"
    }
    for effect in effects:
        if not isinstance(effect, dict) or str(effect.get("effect_type") or "") not in allowed:
            raise ValueError(f"Unsupported {trigger} card effect.")
        if effect.get("effect_type") == "modify_token":
            payload = effect.get("payload") or {}
            if str(payload.get("token_id") or "") not in token_ids:
                raise ValueError("Token effects must reference an existing token.")
            if int(payload.get("amount") or 0) == 0:
                raise ValueError("Token effects must add or remove at least one token.")


def _validate_event_requirements(value: Any) -> None:
    requirements = value or []
    if not isinstance(requirements, list):
        raise ValueError("Event requirements must be a list.")
    for requirement in requirements:
        if not isinstance(requirement, dict) or str(requirement.get("type") or "") not in {
            "resource",
            "tag",
            "pillar",
        }:
            raise ValueError("Unsupported event requirement.")
        if requirement.get("type") == "pillar" and requirement.get("operator") not in {
            "gt",
            "gte",
            "lt",
            "lte",
            "eq",
        }:
            raise ValueError("Pillar requirements need a valid comparison.")


def _validate_event_effects(value: Any) -> None:
    effects = value or []
    if not isinstance(effects, list):
        raise ValueError("Event effects must be a list.")
    allowed = {
        "modify_pillar",
        "modify_resources",
        "convert_resources",
        "draw_card",
        "reduce_refill_draws",
        "suppress_plague_morale",
        "destroy_building",
        "remove_all_resources",
        "discard_cards",
        "modify_plague",
        "modify_unrest",
        "modify_fortified",
        "modify_city_tokens",
        "waive_next_structure_tag_requirement",
    }
    for effect in effects:
        if not isinstance(effect, dict) or str(effect.get("effect_type") or "") not in allowed:
            raise ValueError("Unsupported event effect.")
        if effect.get("effect_type") == "modify_resources":
            payload = effect.get("payload") or {}
            if int(payload.get("amount") or 0) == 0:
                raise ValueError("Resource effects must add or remove at least one resource.")
            resource_id = str(payload.get("resource_id") or "")
            volatile_ids = {
                str(entry.get("id") or "")
                for entry in load_static_catalog_entries()
                if entry.get("kind") == "tags"
                and (entry.get("data") or {}).get("resource_type") == "volatile"
            }
            if resource_id and resource_id not in volatile_ids:
                raise ValueError("Resource effects must reference an existing volatile resource.")
        if effect.get("effect_type") == "convert_resources":
            payload = effect.get("payload") or {}
            if int(payload.get("amount") or 0) < 1:
                raise ValueError("Resource conversions must convert at least one resource.")
            volatile_ids = {
                str(entry.get("id") or "")
                for entry in load_static_catalog_entries()
                if entry.get("kind") == "tags"
                and (entry.get("data") or {}).get("resource_type") == "volatile"
            }
            source_id = str(payload.get("source_resource_id") or "")
            target_id = str(payload.get("target_resource_id") or "")
            if source_id and source_id not in volatile_ids:
                raise ValueError("Conversion source must be an existing volatile resource.")
            if target_id and target_id not in volatile_ids:
                raise ValueError("Conversion destination must be an existing volatile resource.")
            if source_id and source_id == target_id:
                raise ValueError("Conversion source and destination must differ.")
        if effect.get("effect_type") in {"modify_plague", "modify_unrest", "modify_fortified"}:
            if int((effect.get("payload") or {}).get("amount") or 0) == 0:
                raise ValueError("Token effects must add or remove at least one token.")
        if effect.get("effect_type") == "modify_city_tokens":
            token_changes = (effect.get("payload") or {}).get("tokens")
            allowed_token_ids = {"plague-token", "unrest-token", "fortified-token"}
            if (
                not isinstance(token_changes, dict)
                or not token_changes
                or any(token_id not in allowed_token_ids for token_id in token_changes)
                or not any(int(amount or 0) != 0 for amount in token_changes.values())
            ):
                raise ValueError("Grouped City token effects need at least one valid non-zero token change.")
        condition = effect.get("condition")
        if condition and (
            not isinstance(condition, dict)
            or condition.get("source_type") not in {"tag", "resource", "pillar"}
            or condition.get("operator") not in {"gt", "gte", "lt", "lte", "eq"}
        ):
            raise ValueError("Event effect condition is invalid.")
        if condition and condition.get("target_type", "number") not in {"number", "tag"}:
            raise ValueError("Event effect condition target type is invalid.")
        if condition and condition.get("target_type") == "tag":
            if condition.get("source_type") != "tag" or not str(condition.get("target_id") or ""):
                raise ValueError("Only a tag count can be compared with another tag count.")


def _catalog_category(kind: CatalogKind, category: str, data: dict[str, Any]) -> str:
    if kind == "tags":
        return str((data or {}).get("resource_type") or "").strip()
    return str(category or "").strip()


def delete_catalog_record(db: Session, *, kind: CatalogKind, entry_id: str) -> bool:
    if kind in STATIC_CATALOG_KINDS:
        raise ValueError(f"{kind} are repository-owned and cannot be deleted from the admin console.")
    row = get_catalog_record(db, kind=kind, entry_id=entry_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
