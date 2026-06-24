import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from backend.app.account_bootstrap import ensure_user_bootstrap
from backend.app.admin_router import (
    admin_catalog_summary,
    admin_create_catalog_entry,
    admin_delete_catalog_entry,
    admin_get_user_detail,
    admin_list_agendas,
    admin_list_audit_logs,
    admin_list_cards,
    admin_list_events,
    admin_list_roles,
    admin_list_tags,
    admin_list_users,
    admin_update_catalog_entry,
    admin_update_user_admin_flag,
    require_admin,
)
from backend.app.database import Base, _build_engine
from backend.app.empire_catalog import seed_catalog_entries
from backend.app.schemas import AdminCatalogEntryCreate, AdminCatalogEntryUpdate, AdminUserAdminUpdate
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


def test_admin_can_list_echoes_catalog(tmp_path):
    session_factory = build_test_session(f"sqlite:///{tmp_path / 'catalog.db'}")
    with session_factory() as db:
        admin = ensure_user_bootstrap(
            db,
            create_registered_user(db, "admin@test.local", "verysecurepassword"),
            force_admin=True,
        )
        seed_catalog_entries(db)

        summary = asyncio.run(admin_catalog_summary(_admin=admin, db=db))
        assert summary.tags >= 1
        assert summary.cards >= 1
        assert summary.roles >= 1
        assert summary.agendas >= 1
        assert summary.events >= 1

        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        cards = asyncio.run(admin_list_cards(_admin=admin, db=db))
        roles = asyncio.run(admin_list_roles(_admin=admin, db=db))
        agendas = asyncio.run(admin_list_agendas(_admin=admin, db=db))
        events = asyncio.run(admin_list_events(_admin=admin, db=db))

        assert {entry.kind for entry in tags} == {"tags"}
        assert any(entry.id == "lumber-camp" for entry in cards)
        assert any(entry.id == "minister-state" for entry in roles)
        assert any(entry.id == "merchant-syndicate" for entry in agendas)
        assert any(entry.id == "shattered-crown" for entry in events)


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
                    category="state",
                    summary="Controls fleets and sea lanes.",
                    color="#2563eb",
                    data={"scope": "local"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert created.id == "naval"
        assert created.color == "#2563eb"

        updated = asyncio.run(
            admin_update_catalog_entry(
                "tags",
                "naval",
                AdminCatalogEntryUpdate(
                    name="Naval Power",
                    category="state",
                    summary="Controls fleets, ports, and sea lanes.",
                    color="#1d4ed8",
                    data={"scope": "global"},
                ),
                _admin=admin,
                db=db,
            )
        )
        assert updated.name == "Naval Power"
        assert updated.data["scope"] == "global"

        deleted = asyncio.run(admin_delete_catalog_entry("tags", "naval", _admin=admin, db=db))
        assert deleted.status == "ok"

        tags = asyncio.run(admin_list_tags(_admin=admin, db=db))
        assert all(entry.id != "naval" for entry in tags)

        logs = asyncio.run(admin_list_audit_logs(query="catalog_entry", _admin=admin, db=db))
        assert len(logs) == 3
