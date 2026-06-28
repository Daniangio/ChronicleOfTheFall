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
    admin_list_events,
    admin_list_groups,
    admin_list_images,
    admin_list_event_types,
    admin_list_ministries,
    admin_list_tags,
    admin_list_users,
    admin_update_catalog_entry,
    admin_update_user_admin_flag,
    require_admin,
)
from backend.app.database import Base, _build_engine
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
        assert summary.event_types == 0
        assert summary.agendas == 0
        assert summary.events == 0
        assert summary.groups == 0
        assert summary.card_categories == 0
        assert summary.decks == 0

        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        images = asyncio.run(admin_list_images(_admin=admin, db=db))
        cards = asyncio.run(admin_list_cards(_admin=admin, db=db))
        ministries = asyncio.run(admin_list_ministries(_admin=admin, db=db))
        event_types = asyncio.run(admin_list_event_types(_admin=admin, db=db))
        agendas = asyncio.run(admin_list_agendas(_admin=admin, db=db))
        events = asyncio.run(admin_list_events(_admin=admin, db=db))
        groups = asyncio.run(admin_list_groups(_admin=admin, db=db))
        card_categories = asyncio.run(admin_list_card_categories(_admin=admin, db=db))
        decks = asyncio.run(admin_list_decks(_admin=admin, db=db))

        assert tags == []
        assert images == []
        assert cards == []
        assert ministries == []
        assert event_types == []
        assert agendas == []
        assert events == []
        assert groups == []
        assert card_categories == []
        assert decks == []


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


def test_ministry_domain_ids_must_be_unique(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'ministry_domains.db'}")
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
                    data={"domain_id": "military"},
                ),
                _admin=admin,
                db=db,
            )
        )

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                admin_create_catalog_entry(
                    "ministries",
                    AdminCatalogEntryCreate(
                        id="minister-war-duplicate",
                        name="Duplicate War Minister",
                        category="ministry",
                        data={"domain_id": "military"},
                    ),
                    _admin=admin,
                    db=db,
                )
            )
        assert exc_info.value.status_code == 400
