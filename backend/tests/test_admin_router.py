import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from backend.app.account_bootstrap import ensure_user_bootstrap
from backend.app.admin_router import (
    admin_catalog_summary,
    admin_create_catalog_entry,
    admin_delete_catalog_entry,
    admin_export_catalog,
    admin_import_catalog,
    admin_get_user_detail,
    admin_search_catalog_entries,
    admin_list_agendas,
    admin_list_audit_logs,
    admin_list_cards,
    admin_list_decks,
    admin_list_effect_icons,
    admin_list_events,
    admin_list_groups,
    admin_list_images,
    admin_list_ministries,
    admin_list_pillars,
    admin_list_tags,
    admin_list_tokens,
    admin_list_users,
    admin_update_catalog_entry,
    admin_update_user_admin_flag,
    require_admin,
)
from backend.app.database import Base, _build_engine
from backend.app.empire_catalog import DYNAMIC_CATALOG_KINDS, STATIC_CATALOG_KINDS
from backend.app.schemas import (
    AdminCatalogEntryCreate,
    AdminCatalogEntryUpdate,
    AdminCatalogImportEntry,
    AdminCatalogImportPayload,
    AdminUserAdminUpdate,
)
from backend.app.user_repository import create_registered_user


def build_test_session(database_url: str):
    engine = _build_engine(database_url)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        future=True,
        expire_on_commit=False,
    )


def test_admin_can_list_update_and_audit_users(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'admin.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )
        user = ensure_user_bootstrap(
            db,
            create_registered_user(db, "player@test.local", "verysecurepassword"),
        )

        users = asyncio.run(admin_list_users(query="player", _admin=admin, db=db))
        assert len(users) == 1
        assert users[0].id == user.id
        assert users[0].is_admin is False

        detail = asyncio.run(admin_get_user_detail(user.id, _admin=admin, db=db))
        assert detail.user.username == "player@test.local"
        assert detail.friends_count == 0

        updated = asyncio.run(
            admin_update_user_admin_flag(
                user.id,
                AdminUserAdminUpdate(is_admin=True),
                _admin=admin,
                db=db,
            )
        )
        assert updated.user.is_admin is True

        logs = asyncio.run(admin_list_audit_logs(query="admin_flag", _admin=admin, db=db))
        assert len(logs) == 1
        assert logs[0].target_id == user.id


def test_non_admin_is_rejected(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'admin_reject.db'}")
    with session_factory() as db:
        user = ensure_user_bootstrap(
            db,
            create_registered_user(db, "player@test.local", "verysecurepassword"),
        )

    with pytest.raises(HTTPException) as exc_info:
        require_admin(user)

    assert exc_info.value.status_code == 403


def test_new_database_catalog_starts_with_repository_ingredients(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        summary = asyncio.run(admin_catalog_summary(_admin=admin, db=db))
        assert summary.tags == 14
        assert summary.images == 39
        assert summary.cards == 0
        assert summary.ministries == 5
        assert summary.pillars == 3
        assert summary.tokens == 3
        assert summary.effect_icons == 14
        assert summary.agendas == 0
        assert summary.events == 0
        assert summary.groups == 0
        assert summary.levels == 0
        assert summary.decks == 0

        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        images = asyncio.run(admin_list_images(_admin=admin, db=db))
        cards = asyncio.run(admin_list_cards(_admin=admin, db=db))
        ministries = asyncio.run(admin_list_ministries(_admin=admin, db=db))
        pillars = asyncio.run(admin_list_pillars(_admin=admin, db=db))
        tokens = asyncio.run(admin_list_tokens(_admin=admin, db=db))
        effect_icons = asyncio.run(admin_list_effect_icons(_admin=admin, db=db))
        agendas = asyncio.run(admin_list_agendas(_admin=admin, db=db))
        events = asyncio.run(admin_list_events(_admin=admin, db=db))
        groups = asyncio.run(admin_list_groups(_admin=admin, db=db))
        decks = asyncio.run(admin_list_decks(_admin=admin, db=db))

        assert {entry.id for entry in tags} >= {"culture", "military", "labor", "wealth"}
        assert {entry.id for entry in images} >= {"storage", "tag-military", "minister-war"}
        assert cards == []
        assert {entry.id for entry in ministries} >= {"minister-of-the-empire", "minister-of-war"}
        assert {entry.id for entry in pillars} == {
            "pillar-of-morale",
            "pillar-of-stability",
            "pillar-of-treasury",
        }
        assert {entry.id for entry in tokens} == {"plague-token", "unrest-token", "fortified-token"}
        assert {entry.data["effect_type"] for entry in effect_icons} == {
            "modify_pillar",
            "modify_token",
            "modify_resources",
            "convert_resources",
            "draw_card",
            "destroy_building",
            "remove_all_resources",
            "discard_cards",
            "modify_plague",
            "modify_unrest",
            "modify_fortified",
            "waive_next_structure_tag_requirement",
            "add_building_slots",
            "storage",
        }
        assert agendas == []
        assert events == []
        assert groups == []
        assert decks == []

        asyncio.run(
            admin_create_catalog_entry(
                "cards",
                AdminCatalogEntryCreate(
                    id="capital-foundation",
                    name="Capital Foundation",
                    category="city",
                    data={"building_slots": 4},
                ),
                _admin=admin,
                db=db,
            )
        )
        asyncio.run(
            admin_create_catalog_entry(
                "cards",
                AdminCatalogEntryCreate(
                    id="farm",
                    name="Farm",
                    category="structure",
                    data={},
                ),
                _admin=admin,
                db=db,
            )
        )
        created_deck = asyncio.run(
            admin_create_catalog_entry(
                "decks",
                AdminCatalogEntryCreate(
                    id="starter-deck",
                    name="Starter Deck",
                    category="deck",
                    data={
                        "item_ids": ["farm"] * 18,
                        "initial_setup": {"3": ["farm"] * 12, "4": ["farm"] * 3, "5": ["farm"] * 3},
                    },
                ),
                _admin=admin,
                db=db,
            )
        )
        created_level = asyncio.run(
            admin_create_catalog_entry(
                "levels",
                AdminCatalogEntryCreate(
                    id="starter-level",
                    name="Starter Level",
                    category="level",
                    data={
                        "initial_city_card_id": "capital-foundation",
                        "deck_id": created_deck.id,
                    },
                ),
                _admin=admin,
                db=db,
            )
        )
        assert created_deck.kind == "decks"
        assert created_level.kind == "levels"


def test_repository_ingredients_are_loaded_and_read_only(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'effect_icons.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        effect_icons = asyncio.run(admin_list_effect_icons(_admin=admin, db=db))
        discard = next(entry for entry in effect_icons if entry.data["effect_type"] == "discard_cards")
        draw = next(entry for entry in effect_icons if entry.data["effect_type"] == "draw_card")
        assert len(effect_icons) == 14
        assert discard.data["icon_image_id"] == "discard-card-image"
        assert draw.data["icon_image_id"] == "draw-card-image"

        for kind in STATIC_CATALOG_KINDS:
            with pytest.raises(HTTPException) as exc_info:
                asyncio.run(
                    admin_create_catalog_entry(
                        kind,
                        AdminCatalogEntryCreate(id="new-static", name="New Static"),
                        _admin=admin,
                        db=db,
                    )
                )
            assert exc_info.value.status_code == 400

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                admin_update_catalog_entry(
                    "effect-icons",
                    discard.id,
                    AdminCatalogEntryUpdate(
                        id=discard.id,
                        name=discard.name,
                        category="effect-icon",
                        data=discard.data,
                    ),
                    _admin=admin,
                    db=db,
                )
            )
        assert exc_info.value.status_code == 400

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(admin_delete_catalog_entry("effect-icons", discard.id, _admin=admin, db=db))
        assert exc_info.value.status_code == 400


def test_admin_can_create_update_and_delete_catalog_entries(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_mutation.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        created = asyncio.run(
            admin_create_catalog_entry(
                "agendas",
                AdminCatalogEntryCreate(
                    id="naval-agenda",
                    name="Naval Agenda",
                    category="agenda",
                    summary="Controls fleets and sea lanes.",
                    data={"scope": "local"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert created.id == "naval-agenda"
        assert created.category == "agenda"

        updated = asyncio.run(
            admin_update_catalog_entry(
                "agendas",
                "naval-agenda",
                AdminCatalogEntryUpdate(
                    name="Naval Power Agenda",
                    category="agenda",
                    summary="Controls fleets, ports, and sea lanes.",
                    data={"scope": "global"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert updated.name == "Naval Power Agenda"
        assert updated.data["scope"] == "global"

        renamed = asyncio.run(
            admin_update_catalog_entry(
                "agendas",
                "naval-agenda",
                AdminCatalogEntryUpdate(
                    id="fleet-agenda",
                    name="Fleet Agenda",
                    category="agenda",
                    data={},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert renamed.id == "fleet-agenda"
        assert renamed.name == "Fleet Agenda"

        derived = asyncio.run(
            admin_update_catalog_entry(
                "agendas",
                "fleet-agenda",
                AdminCatalogEntryUpdate(
                    id="",
                    name="Fleet Command Agenda",
                    category="agenda",
                    data={},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert derived.id == "fleet-command-agenda"

        asyncio.run(
            admin_create_catalog_entry(
                "groups",
                AdminCatalogEntryCreate(
                    id="occupied-id",
                    name="Occupied",
                    category="mutually-exclusive",
                    data={"type": "mutually_exclusive"},
                ),
                _admin=admin,
                db=db,
            )
        )
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                admin_update_catalog_entry(
                    "agendas",
                    "fleet-command-agenda",
                    AdminCatalogEntryUpdate(
                        id="occupied-id",
                        name="Fleet Command Agenda",
                        category="agenda",
                        data={},
                    ),
                    _admin=admin,
                    db=db,
                )
        )
        assert exc_info.value.status_code == 400
        assert "groups:occupied-id" in exc_info.value.detail

        deleted = asyncio.run(admin_delete_catalog_entry("agendas", "fleet-command-agenda", _admin=admin, db=db))
        assert deleted.status == "ok"

        agendas = asyncio.run(admin_list_agendas(_admin=admin, db=db))
        assert all(entry.id != "fleet-command-agenda" for entry in agendas)

        logs = asyncio.run(admin_list_audit_logs(query="catalog_entry", _admin=admin, db=db))
        assert len(logs) == 6


def test_catalog_inspector_finds_cross_kind_id_conflicts(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_inspector.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        asyncio.run(
            admin_create_catalog_entry(
                "agendas",
                AdminCatalogEntryCreate(
                    id="shared-dynamic-id",
                    name="Shared Dynamic Id",
                    category="agenda",
                    data={},
                ),
                _admin=admin,
                db=db,
            )
        )

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                admin_create_catalog_entry(
                    "groups",
                    AdminCatalogEntryCreate(
                        id="shared-dynamic-id",
                        name="Shared Dynamic Id",
                        category="mutually-exclusive",
                        data={"type": "mutually_exclusive"},
                    ),
                    _admin=admin,
                    db=db,
                )
            )

        assert exc_info.value.status_code == 400
        assert "agendas:shared-dynamic-id" in exc_info.value.detail

        matches = asyncio.run(admin_search_catalog_entries(query="shared-dynamic-id", _admin=admin, db=db))
        assert [(entry.kind, entry.id) for entry in matches] == [("agendas", "shared-dynamic-id")]

        deleted = asyncio.run(admin_delete_catalog_entry("agendas", "shared-dynamic-id", _admin=admin, db=db))
        assert deleted.status == "ok"
        assert asyncio.run(admin_search_catalog_entries(query="shared-dynamic-id", _admin=admin, db=db)) == []


def test_admin_can_export_and_import_catalog_entries(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_import.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        exported = asyncio.run(admin_export_catalog(kind="tags", _admin=admin, db=db))
        assert exported["kind"] == "tags"
        assert len(exported["entries"]) == 14
        labor_before = next(entry for entry in exported["entries"] if entry["id"] == "labor")

        result = asyncio.run(
            admin_import_catalog(
                AdminCatalogImportPayload(
                    kind="tags",
                    entries=[
                        AdminCatalogImportEntry(
                            id="labor",
                            kind="tags",
                            name="Labor Pool",
                            category="ignored",
                            summary="Updated by import.",
                            color="#b45309",
                            data={"resource_type": "volatile"},
                        ),
                        AdminCatalogImportEntry(
                            id="stone",
                            kind="tags",
                            name="Stone",
                            category="ignored",
                            summary="Imported construction resource.",
                            color="#78716c",
                            data={"resource_type": "permanent"},
                        ),
                    ],
                ),
                _admin=admin,
                db=db,
            )
        )

        assert result.created == 0
        assert result.updated == 0
        assert result.skipped == 2
        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        assert all(entry.id != "stone" for entry in tags)
        labor_after = next(entry for entry in tags if entry.id == "labor")
        assert labor_after.name == labor_before["name"]
        assert labor_after.category == "volatile"


def test_export_all_includes_every_catalog_admin_kind(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_export_all.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        examples = {
            "cards": AdminCatalogEntryCreate(
                id="test-card",
                name="Test Card",
                category="city",
                data={"building_slots": 4},
            ),
            "agendas": AdminCatalogEntryCreate(id="test-agenda", name="Test Agenda", category="agenda", data={}),
            "events": AdminCatalogEntryCreate(
                id="test-event",
                name="Test Event",
                category="event",
                data={"subtype": "edict", "requirements": [], "main_effects": [], "alternative_effects": []},
            ),
            "groups": AdminCatalogEntryCreate(id="test-group", name="Test Group", category="mutually-exclusive", data={"type": "mutually_exclusive"}),
            "levels": AdminCatalogEntryCreate(
                id="test-level",
                name="Test Level",
                category="level",
                data={
                    "initial_city_card_id": "test-card",
                    "deck_id": "test-deck",
                },
            ),
            "decks": AdminCatalogEntryCreate(
                id="test-deck",
                name="Test Deck",
                category="deck",
                data={
                    "item_ids": ["test-card"] * 18,
                    "initial_setup": {
                        "3": ["test-card"] * 12,
                        "4": ["test-card"] * 3,
                        "5": ["test-card"] * 3,
                    },
                },
            ),
        }
        assert set(examples) == set(DYNAMIC_CATALOG_KINDS)

        for kind in DYNAMIC_CATALOG_KINDS:
            asyncio.run(admin_create_catalog_entry(kind, examples[kind], _admin=admin, db=db))

        exported = asyncio.run(admin_export_catalog(kind="", _admin=admin, db=db))
        exported_kinds = {entry["kind"] for entry in exported["entries"]}
        assert exported["kind"] == "all"
        assert exported["catalog_kinds"] == list(DYNAMIC_CATALOG_KINDS)
        assert exported_kinds == set(DYNAMIC_CATALOG_KINDS)

        import_session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_export_all_import.db'}")
        with import_session_factory() as import_db:
            import_admin = ensure_user_bootstrap(
                import_db,
                create_registered_user(import_db, "import-admin@test.local", "verysecurepassword"),
                force_admin=True,
            )
            result = asyncio.run(
                admin_import_catalog(
                    AdminCatalogImportPayload(**exported),
                    _admin=import_admin,
                    db=import_db,
                )
            )
            assert result.created == len(exported["entries"])
            assert result.skipped == 0


def test_catalog_import_skips_unknown_kinds_and_strips_image_payloads(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_sanitize.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        result = asyncio.run(
            admin_import_catalog(
                AdminCatalogImportPayload(
                    kind="all",
                    entries=[
                        AdminCatalogImportEntry(
                            id="legacy-domain",
                            kind="event-types",
                            name="Legacy Domain",
                            data={},
                        ),
                        AdminCatalogImportEntry(
                            id="war-icon",
                            kind="images",
                            name="war.png",
                            category="image",
                            data={"src": "data:image/png;base64,AA==", "path": "/tmp/war.png", "notes": "keep"},
                        ),
                        AdminCatalogImportEntry(
                            id="war",
                            kind="tags",
                            name="War",
                            category="permanent",
                            color="#991b1b",
                            data={
                                "resource_type": "permanent",
                                "icon": "/media/images/war.png",
                                "domain_icon": "data:image/png;base64,AA==",
                                "icon_image_id": "war-icon",
                            },
                        ),
                        AdminCatalogImportEntry(
                            id="war-agenda",
                            kind="agendas",
                            name="War Agenda",
                            category="agenda",
                            data={"notes": "keep"},
                        ),
                    ],
                ),
                _admin=admin,
                db=db,
            )
        )

        assert result.created == 1
        assert result.skipped == 3
        images = asyncio.run(admin_list_images(_admin=admin, db=db))
        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        assert all(entry.id != "war-icon" for entry in images)
        assert all(entry.id != "war" for entry in tags)

        exported = asyncio.run(admin_export_catalog(kind="", _admin=admin, db=db))
        exported_by_id = {entry["id"]: entry for entry in exported["entries"]}
        assert exported_by_id["war-agenda"]["data"] == {"notes": "keep"}


def test_ministries_are_loaded_from_repository_catalog(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'ministry_symbols.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        ministries = asyncio.run(admin_list_ministries(_admin=admin, db=db))
        assert len(ministries) == 5
        war = next(entry for entry in ministries if entry.id == "minister-of-war")
        assert war.data["symbol"] == "WAR"
        assert war.data["icon_image_id"] == "minister-war"
