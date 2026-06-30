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
    admin_list_agendas,
    admin_list_audit_logs,
    admin_list_cards,
    admin_list_card_categories,
    admin_list_decks,
    admin_list_effect_icons,
    admin_list_events,
    admin_list_groups,
    admin_list_images,
    admin_list_ministries,
    admin_list_pillars,
    admin_list_tags,
    admin_list_users,
    admin_upload_image_asset,
    admin_update_catalog_entry,
    admin_update_user_admin_flag,
    require_admin,
)
from backend.app.database import Base, _build_engine
from backend.app.empire_catalog import CATALOG_KINDS
from backend.app.schemas import (
    AdminCatalogEntryCreate,
    AdminCatalogEntryUpdate,
    AdminCatalogImportEntry,
    AdminCatalogImportPayload,
    AdminUserAdminUpdate,
)
from backend.app.server_models import User
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


def test_new_database_catalog_starts_empty(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        summary = asyncio.run(admin_catalog_summary(_admin=admin, db=db))
        assert summary.tags == 0
        assert summary.images == 0
        assert summary.cards == 0
        assert summary.ministries == 0
        assert summary.pillars == 0
        assert summary.effect_icons == 0
        assert summary.agendas == 0
        assert summary.events == 0
        assert summary.groups == 0
        assert summary.card_categories == 0
        assert summary.empire_decks == 0
        assert summary.event_decks == 0
        assert summary.levels == 0
        assert summary.decks == 0

        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        images = asyncio.run(admin_list_images(_admin=admin, db=db))
        cards = asyncio.run(admin_list_cards(_admin=admin, db=db))
        ministries = asyncio.run(admin_list_ministries(_admin=admin, db=db))
        pillars = asyncio.run(admin_list_pillars(_admin=admin, db=db))
        effect_icons = asyncio.run(admin_list_effect_icons(_admin=admin, db=db))
        agendas = asyncio.run(admin_list_agendas(_admin=admin, db=db))
        events = asyncio.run(admin_list_events(_admin=admin, db=db))
        groups = asyncio.run(admin_list_groups(_admin=admin, db=db))
        card_categories = asyncio.run(admin_list_card_categories(_admin=admin, db=db))
        decks = asyncio.run(admin_list_decks(_admin=admin, db=db))

        assert tags == []
        assert images == []
        assert cards == []
        assert ministries == []
        assert pillars == []
        assert effect_icons == []
        assert agendas == []
        assert events == []
        assert groups == []
        assert card_categories == []
        assert decks == []

        created_empire_deck = asyncio.run(
            admin_create_catalog_entry(
                "empire-decks",
                AdminCatalogEntryCreate(
                    id="starter-empire",
                    name="Starter Empire",
                    category="empire",
                    data={"item_ids": ["farm", "farm", "market"]},
                ),
                _admin=admin,
                db=db,
            )
        )
        created_event_deck = asyncio.run(
            admin_create_catalog_entry(
                "event-decks",
                AdminCatalogEntryCreate(
                    id="starter-events",
                    name="Starter Events",
                    category="events",
                    data={"item_ids": ["raid"]},
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
                        "empire_deck_id": created_empire_deck.id,
                        "event_deck_id": created_event_deck.id,
                        "common_pool_deck_id": created_empire_deck.id,
                    },
                ),
                _admin=admin,
                db=db,
            )
        )
        assert created_empire_deck.kind == "empire-decks"
        assert created_event_deck.kind == "event-decks"
        assert created_level.kind == "levels"


def test_admin_can_manage_effect_icons(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'effect_icons.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        created = asyncio.run(
            admin_create_catalog_entry(
                "effect-icons",
                AdminCatalogEntryCreate(
                    id="discard-card",
                    name="discard-card.png",
                    category="effect-icon",
                    summary="",
                    data={
                        "effect_type": "discard_card",
                        "icon_image_id": "discard-card",
                        "icon": "data:image/png;base64,AA==",
                    },
                ),
                _admin=admin,
                db=db,
            )
        )
        assert created.id == "discard-card"
        assert created.kind == "effect-icons"
        assert created.name == "discard-card.png"
        assert created.category == "effect-icon"

        effect_icons = asyncio.run(admin_list_effect_icons(_admin=admin, db=db))
        assert [entry.id for entry in effect_icons] == ["discard-card"]

        updated = asyncio.run(
            admin_update_catalog_entry(
                "effect-icons",
                "discard-card",
                AdminCatalogEntryUpdate(
                    name="discard-card-updated.png",
                    category="effect-icon",
                    summary="Shared event effect icon.",
                    data={"effect_type": "discard_card", "icon_image_id": "discard-card-updated"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert updated.name == "discard-card-updated.png"
        assert updated.summary == "Shared event effect icon."

        deleted = asyncio.run(admin_delete_catalog_entry("effect-icons", "discard-card", _admin=admin, db=db))
        assert deleted.status == "ok"
        assert asyncio.run(admin_list_effect_icons(_admin=admin, db=db)) == []


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
                "tags",
                AdminCatalogEntryCreate(
                    id="naval",
                    name="Naval",
                    category="ignored",
                    summary="Controls fleets and sea lanes.",
                    color="#2563eb",
                    data={"resource_type": "permanent", "scope": "local"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert created.id == "naval"
        assert created.color == "#2563eb"
        assert created.category == "permanent"

        updated = asyncio.run(
            admin_update_catalog_entry(
                "tags",
                "naval",
                AdminCatalogEntryUpdate(
                    name="Naval Power",
                    category="ignored",
                    summary="Controls fleets, ports, and sea lanes.",
                    color="#1d4ed8",
                    data={"resource_type": "volatile", "scope": "global"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert updated.name == "Naval Power"
        assert updated.category == "volatile"
        assert updated.data["scope"] == "global"

        deleted = asyncio.run(admin_delete_catalog_entry("tags", "naval", _admin=admin, db=db))
        assert deleted.status == "ok"

        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        assert all(entry.id != "naval" for entry in tags)

        logs = asyncio.run(admin_list_audit_logs(query="catalog_entry", _admin=admin, db=db))
        assert len(logs) == 3


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
        assert exported["entries"] == []

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

        assert result.created == 2
        assert result.updated == 0
        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        assert any(entry.id == "stone" for entry in tags)
        assert next(entry for entry in tags if entry.id == "labor").name == "Labor Pool"
        assert next(entry for entry in tags if entry.id == "labor").category == "volatile"
        assert next(entry for entry in tags if entry.id == "stone").category == "permanent"


def test_export_all_includes_every_catalog_admin_kind(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog_export_all.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        examples = {
            "tags": AdminCatalogEntryCreate(
                id="test-tag",
                name="Test Tag",
                category="permanent",
                color="#64748b",
                data={"resource_type": "permanent"},
            ),
            "images": AdminCatalogEntryCreate(id="test-image", name="test-image.png", category="image", data={}),
            "cards": AdminCatalogEntryCreate(id="test-card", name="Test Card", category="building", data={}),
            "ministries": AdminCatalogEntryCreate(id="test-ministry", name="Test Ministry", category="ministry", data={}),
            "pillars": AdminCatalogEntryCreate(id="test-pillar", name="Test Pillar", category="pillar", data={"min": 0, "max": 10}),
            "effect-icons": AdminCatalogEntryCreate(id="test-effect-icon", name="Test Effect Icon", category="effect-icon", data={"effect_type": "test"}),
            "agendas": AdminCatalogEntryCreate(id="test-agenda", name="Test Agenda", category="agenda", data={}),
            "events": AdminCatalogEntryCreate(id="test-event", name="Test Event", category="event", data={}),
            "groups": AdminCatalogEntryCreate(id="test-group", name="Test Group", category="mutually-exclusive", data={"type": "mutually_exclusive"}),
            "card-categories": AdminCatalogEntryCreate(id="test-category", name="Test Category", category="card-category", data={}),
            "empire-decks": AdminCatalogEntryCreate(id="test-empire-deck", name="Test Empire Deck", category="empire", data={"item_ids": ["test-card"]}),
            "event-decks": AdminCatalogEntryCreate(id="test-event-deck", name="Test Event Deck", category="events", data={"item_ids": ["test-event"]}),
            "levels": AdminCatalogEntryCreate(
                id="test-level",
                name="Test Level",
                category="level",
                data={
                    "initial_city_card_id": "test-card",
                    "empire_deck_id": "test-empire-deck",
                    "event_deck_id": "test-event-deck",
                    "common_pool_deck_id": "test-empire-deck",
                },
            ),
            "decks": AdminCatalogEntryCreate(id="test-legacy-deck", name="Test Legacy Deck", category="common-pool", data={"deck_type": "common-pool", "item_ids": ["test-card"]}),
        }
        assert set(examples) == set(CATALOG_KINDS)

        for kind in CATALOG_KINDS:
            asyncio.run(admin_create_catalog_entry(kind, examples[kind], _admin=admin, db=db))

        exported = asyncio.run(admin_export_catalog(kind="", _admin=admin, db=db))
        exported_kinds = {entry["kind"] for entry in exported["entries"]}
        assert exported["kind"] == "all"
        assert exported["catalog_kinds"] == list(CATALOG_KINDS)
        assert exported_kinds == set(CATALOG_KINDS)

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
            assert result.created == len(CATALOG_KINDS)
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
                    ],
                ),
                _admin=admin,
                db=db,
            )
        )

        assert result.created == 2
        assert result.skipped == 1
        images = asyncio.run(admin_list_images(_admin=admin, db=db))
        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        assert images[0].data == {"notes": "keep"}
        assert next(entry for entry in tags if entry.id == "war").data == {
            "resource_type": "permanent",
            "icon_image_id": "war-icon",
        }

        exported = asyncio.run(admin_export_catalog(kind="", _admin=admin, db=db))
        exported_by_id = {entry["id"]: entry for entry in exported["entries"]}
        assert exported_by_id["war-icon"]["data"] == {"notes": "keep"}
        assert "icon" not in exported_by_id["war"]["data"]


def test_admin_can_upload_image_asset(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.app.admin_router.settings.IMAGE_STORAGE_DIR", str(tmp_path / "images"))
    monkeypatch.setattr("backend.app.admin_router.settings.IMAGE_PUBLIC_PATH", "/media/images")
    admin = User(id="admin", username="admin@test.local", is_admin=True)

    uploaded = asyncio.run(
        admin_upload_image_asset(
            payload={
                "id": "Minister War",
                "filename": "war-symbol.png",
                "data_url": "data:image/png;base64,iVBORw0KGgo=",
            },
            _admin=admin,
        )
    )

    assert uploaded["id"] == "minister-war"
    assert uploaded["name"] == "war-symbol.png"
    assert uploaded["src"] == "/media/images/minister-war.png"
    assert (tmp_path / "images" / "minister-war.png").exists()


def test_ministry_symbols_are_plain_metadata(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'ministry_symbols.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )

        asyncio.run(
            admin_create_catalog_entry(
                "ministries",
                AdminCatalogEntryCreate(
                    id="minister-war",
                    name="Minister of War",
                    category="ministry",
                    data={
                        "symbol": "WAR",
                        "can_finalize_projects": True,
                        "can_block_player_council": True,
                    },
                ),
                _admin=admin,
                db=db,
            )
        )

        duplicate_symbol = asyncio.run(
            admin_create_catalog_entry(
                "ministries",
                AdminCatalogEntryCreate(
                    id="minister-war-duplicate",
                    name="Duplicate War Minister",
                    category="ministry",
                    data={"symbol": "WAR"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert duplicate_symbol.data == {"symbol": "WAR"}
