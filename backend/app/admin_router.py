from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .db_models import AdminAuditLogRecord, GameCatalogEntryRecord, UserProfileRecord
from .empire_catalog import (
    CATALOG_KINDS,
    CatalogKind,
    catalog_record_summary,
    create_catalog_record,
    delete_catalog_record,
    list_catalog_records,
    normalize_catalog_id,
    update_catalog_record,
    validate_catalog_kind,
)
from .friend_service import list_friends_summary
from .runtime_state import get_presence_service
from .schemas import (
    AdminCatalogEntry,
    AdminCatalogEntryCreate,
    AdminCatalogImportPayload,
    AdminCatalogImportResult,
    AdminCatalogEntryUpdate,
    AdminCatalogSummary,
    AdminAuditLogEntry,
    AdminMutationStatus,
    AdminUserAdminUpdate,
    AdminUserDetail,
    AdminUserSummary,
    UserPublic,
)
from .security import get_current_user
from .server_models import User
from .user_repository import get_registered_user_by_id, list_registered_users


router = APIRouter()

IMAGE_DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", re.DOTALL)
IMAGE_EXTENSIONS = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
}
IMAGE_METADATA_KEYS = {"src", "path", "file_path", "url", "icon", "image"}


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _record_admin_audit(
    db: Session,
    *,
    admin: User,
    action: str,
    target_type: str,
    target_id: str,
    payload: dict | None = None,
) -> AdminAuditLogRecord:
    row = AdminAuditLogRecord(
        admin_user_id=admin.id,
        admin_username=admin.username,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=jsonable_encoder(payload or {}),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _query_text(value, default: str = "") -> str:
    if isinstance(value, str):
        return value
    if hasattr(value, "default"):
        fallback = getattr(value, "default")
        return default if fallback is None else str(fallback)
    return default


def _query_int(value, default: int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        return int(value)
    if hasattr(value, "default"):
        fallback = getattr(value, "default")
        if fallback is not None:
            return int(fallback)
    return int(default)


def _sanitize_image_metadata(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _sanitize_image_metadata(child)
            for key, child in value.items()
            if key not in IMAGE_METADATA_KEYS and not (str(key).endswith("_icon") and key != "icon_image_id")
        }
    if isinstance(value, list):
        return [_sanitize_image_metadata(child) for child in value]
    return value


def _catalog_export_entry(entry) -> dict:
    payload = _catalog_entry_response(entry).model_dump()
    payload["data"] = _sanitize_image_metadata(payload.get("data") or {})
    return payload


def _catalog_import_data(data: dict[str, Any]) -> dict[str, Any]:
    sanitized = _sanitize_image_metadata(data or {})
    return sanitized if isinstance(sanitized, dict) else {}


def _image_storage_dir() -> Path:
    directory = Path(settings.IMAGE_STORAGE_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _image_public_src(filename: str) -> str:
    return f"{str(settings.IMAGE_PUBLIC_PATH).rstrip('/')}/{filename}"


def _decode_image_data_url(data_url: str) -> tuple[str, bytes]:
    match = IMAGE_DATA_URL_RE.match(str(data_url or "").strip())
    if not match:
        raise ValueError("Image upload must be a base64 image data URL.")
    mime_type = match.group(1).lower()
    if mime_type not in IMAGE_EXTENSIONS:
        raise ValueError("Unsupported image type.")
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Image upload data is not valid base64.") from exc
    if not payload:
        raise ValueError("Image upload is empty.")
    return mime_type, payload


def _store_uploaded_image_asset(payload: dict) -> dict:
    data_url = str((payload or {}).get("data_url") or "")
    requested_id = str((payload or {}).get("id") or "").strip()
    original_name = str((payload or {}).get("filename") or requested_id or "image").strip()
    mime_type, image_bytes = _decode_image_data_url(data_url)
    fallback_name = Path(original_name).stem or "image"
    image_id = normalize_catalog_id(requested_id or fallback_name)
    extension = IMAGE_EXTENSIONS[mime_type]
    filename = f"{image_id}{extension}"
    path = _image_storage_dir() / filename
    path.write_bytes(image_bytes)
    return {
        "id": image_id,
        "name": original_name or image_id,
        "src": _image_public_src(filename),
        "mime_type": mime_type,
    }


async def _is_online(user_id: str) -> bool:
    presence_service = get_presence_service()
    if presence_service is None:
        return False
    presence = await presence_service.get_presence(user_id)
    return str((presence or {}).get("status") or "") == "online"


async def _admin_summary(user: User) -> AdminUserSummary:
    return AdminUserSummary(
        id=user.id,
        username=user.username,
        email=user.email,
        is_admin=bool(user.is_admin),
        online=await _is_online(user.id),
    )


async def _admin_detail_for_user(db: Session, user_id: str) -> AdminUserDetail:
    user = get_registered_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    friends_summary = list_friends_summary(db, user_id)
    return AdminUserDetail(
        user=UserPublic(
            id=user.id,
            username=user.username,
            email=user.email,
            is_admin=bool(user.is_admin),
            online=await _is_online(user.id),
        ),
        friends_count=len(friends_summary["friends"]),
        incoming_requests_count=len(friends_summary["incoming_requests"]),
        outgoing_requests_count=len(friends_summary["outgoing_requests"]),
    )


@router.get("/admin/users", response_model=list[AdminUserSummary])
async def admin_list_users(
    query: str = Query(default="", max_length=100),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    normalized = _query_text(query).strip().casefold()
    users = list_registered_users(db)
    if normalized:
        users = [
            user
            for user in users
            if normalized in str(user.username or "").casefold()
            or normalized in str(user.email or "").casefold()
            or normalized in str(user.id or "").casefold()
        ]
    users.sort(key=lambda user: (str(user.username or "").casefold(), str(user.id)))
    return [await _admin_summary(user) for user in users]


@router.get("/admin/users/{user_id}", response_model=AdminUserDetail)
async def admin_get_user_detail(
    user_id: str,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return await _admin_detail_for_user(db, user_id)


@router.put("/admin/users/{user_id}/admin", response_model=AdminUserDetail)
async def admin_update_user_admin_flag(
    user_id: str,
    payload: AdminUserAdminUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if get_registered_user_by_id(db, user_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user_id == _admin.id and not payload.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin privileges.",
        )
    profile = db.get(UserProfileRecord, user_id)
    if profile is None:
        profile = UserProfileRecord(user_id=user_id, is_admin=bool(payload.is_admin))
    else:
        profile.is_admin = bool(payload.is_admin)
    db.add(profile)
    db.commit()
    _record_admin_audit(
        db,
        admin=_admin,
        action="update_user_admin_flag",
        target_type="user",
        target_id=user_id,
        payload={"is_admin": bool(payload.is_admin)},
    )
    return await _admin_detail_for_user(db, user_id)


@router.get("/admin/audit-logs", response_model=list[AdminAuditLogEntry])
async def admin_list_audit_logs(
    query: str = Query(default="", max_length=100),
    limit: int = Query(default=100, ge=1, le=500),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(AdminAuditLogRecord)
        .order_by(AdminAuditLogRecord.created_at.desc())
        .limit(_query_int(limit, 100))
    ).scalars().all()
    normalized = _query_text(query).strip().casefold()
    if normalized:
        rows = [
            row
            for row in rows
            if normalized in row.action.casefold()
            or normalized in row.target_type.casefold()
            or normalized in row.target_id.casefold()
            or normalized in row.admin_username.casefold()
        ]
    return [
        AdminAuditLogEntry(
            id=row.id,
            admin_user_id=row.admin_user_id,
            admin_username=row.admin_username,
            action=row.action,
            target_type=row.target_type,
            target_id=row.target_id,
            payload=row.payload or {},
            created_at=row.created_at,
        )
        for row in rows
    ]


def _catalog_entry_response(entry) -> AdminCatalogEntry:
    return AdminCatalogEntry(
        id=entry.id,
        name=entry.name,
        kind=entry.kind,
        category=entry.category,
        summary=entry.summary,
        color=entry.color,
        data=entry.data or {},
    )


def _catalog_response(db: Session, kind: CatalogKind | None = None) -> list[AdminCatalogEntry]:
    return [
        _catalog_entry_response(entry)
        for entry in list_catalog_records(db, kind)
    ]


@router.get("/admin/catalog/summary", response_model=AdminCatalogSummary)
async def admin_catalog_summary(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return AdminCatalogSummary(**catalog_record_summary(db))


@router.get("/admin/catalog/entries", response_model=list[AdminCatalogEntry])
async def admin_search_catalog_entries(
    query: str = Query(default="", max_length=128),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    normalized = _query_text(query).strip().casefold()
    records = list_catalog_records(db)
    if normalized:
        records = [
            record
            for record in records
            if normalized in str(record.id or "").casefold()
            or normalized in str(record.kind or "").casefold()
            or normalized in str(record.name or "").casefold()
            or normalized in str(record.category or "").casefold()
        ]
    return [_catalog_entry_response(record) for record in records[:200]]


@router.get("/admin/tags", response_model=list[AdminCatalogEntry])
async def admin_list_tags(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "tags")


@router.get("/admin/images", response_model=list[AdminCatalogEntry])
async def admin_list_images(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "images")


@router.get("/admin/cards", response_model=list[AdminCatalogEntry])
async def admin_list_cards(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "cards")


@router.get("/admin/ministries", response_model=list[AdminCatalogEntry])
async def admin_list_ministries(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "ministries")


@router.get("/admin/pillars", response_model=list[AdminCatalogEntry])
async def admin_list_pillars(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "pillars")


@router.get("/admin/effect-icons", response_model=list[AdminCatalogEntry])
async def admin_list_effect_icons(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "effect-icons")


@router.get("/admin/agendas", response_model=list[AdminCatalogEntry])
async def admin_list_agendas(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "agendas")


@router.get("/admin/events", response_model=list[AdminCatalogEntry])
async def admin_list_events(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "events")


@router.get("/admin/groups", response_model=list[AdminCatalogEntry])
async def admin_list_groups(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "groups")


@router.get("/admin/card-categories", response_model=list[AdminCatalogEntry])
async def admin_list_card_categories(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _catalog_response(db, "card-categories")


@router.get("/admin/empire-decks", response_model=list[AdminCatalogEntry])
async def admin_list_empire_decks(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "empire-decks")


@router.get("/admin/event-decks", response_model=list[AdminCatalogEntry])
async def admin_list_event_decks(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "event-decks")


@router.get("/admin/levels", response_model=list[AdminCatalogEntry])
async def admin_list_levels(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "levels")


@router.get("/admin/decks", response_model=list[AdminCatalogEntry])
async def admin_list_decks(_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _catalog_response(db, "decks")


@router.get("/admin/catalog/export")
async def admin_export_catalog(
    kind: str = Query(default=""),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        catalog_kind = validate_catalog_kind(kind) if str(kind or "").strip() else None
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    entries = [_catalog_export_entry(entry) for entry in list_catalog_records(db, catalog_kind)]
    return {
        "version": 1,
        "kind": catalog_kind or "all",
        "catalog_kinds": list(CATALOG_KINDS),
        "entries": entries,
    }


@router.post("/admin/catalog/import", response_model=AdminCatalogImportResult)
async def admin_import_catalog(
    payload: AdminCatalogImportPayload,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    created = 0
    updated = 0
    skipped = 0
    forced_kind = None
    if payload.kind and payload.kind != "all":
        try:
            forced_kind = validate_catalog_kind(payload.kind)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    try:
        for entry in payload.entries:
            try:
                catalog_kind = forced_kind or validate_catalog_kind(entry.kind)
            except ValueError:
                skipped += 1
                continue
            if forced_kind is not None and entry.kind != forced_kind:
                skipped += 1
                continue
            normalized_id = normalize_catalog_id(entry.id)
            existing = db.get(GameCatalogEntryRecord, normalized_id)
            if existing is not None and existing.kind != catalog_kind:
                skipped += 1
                continue
            if existing is None:
                create_catalog_record(
                    db,
                    kind=catalog_kind,
                    entry_id=normalized_id,
                    name=entry.name,
                    category=entry.category,
                    summary=entry.summary,
                    color=entry.color,
                    data=_catalog_import_data(entry.data),
                )
                created += 1
            else:
                update_catalog_record(
                    db,
                    kind=catalog_kind,
                    entry_id=normalized_id,
                    name=entry.name,
                    category=entry.category,
                    summary=entry.summary,
                    color=entry.color,
                    data=_catalog_import_data(entry.data),
                )
                updated += 1
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _record_admin_audit(
        db,
        admin=_admin,
        action="import_catalog_entries",
        target_type=forced_kind or "catalog",
        target_id=forced_kind or "all",
        payload={"created": created, "updated": updated, "skipped": skipped},
    )
    return AdminCatalogImportResult(status="ok", created=created, updated=updated, skipped=skipped)


@router.post("/admin/images/upload")
async def admin_upload_image_asset(
    payload: dict = Body(...),
    _admin: User = Depends(require_admin),
):
    return _store_uploaded_image_asset(payload)


@router.post("/admin/images/{entry_id}/upload")
async def admin_upload_image_asset_for_entry(
    entry_id: str,
    payload: dict = Body(...),
    _admin: User = Depends(require_admin),
):
    return _store_uploaded_image_asset({**(payload or {}), "id": entry_id})


@router.post("/admin/{kind}", response_model=AdminCatalogEntry)
async def admin_create_catalog_entry(
    kind: str,
    payload: AdminCatalogEntryCreate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        catalog_kind = validate_catalog_kind(kind)
        entry = create_catalog_record(
            db,
            kind=catalog_kind,
            entry_id=payload.id or payload.name,
            name=payload.name,
            category=payload.category,
            summary=payload.summary,
            color=payload.color,
            data=payload.data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _record_admin_audit(
        db,
        admin=_admin,
        action="create_catalog_entry",
        target_type=catalog_kind,
        target_id=entry.id,
        payload=_catalog_entry_response(entry).model_dump(),
    )
    return _catalog_entry_response(entry)


@router.put("/admin/{kind}/{entry_id}", response_model=AdminCatalogEntry)
async def admin_update_catalog_entry(
    kind: str,
    entry_id: str,
    payload: AdminCatalogEntryUpdate,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        catalog_kind = validate_catalog_kind(kind)
        entry = update_catalog_record(
            db,
            kind=catalog_kind,
            entry_id=entry_id,
            new_entry_id=payload.id,
            name=payload.name,
            category=payload.category,
            summary=payload.summary,
            color=payload.color,
            data=payload.data,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found.")
    _record_admin_audit(
        db,
        admin=_admin,
        action="update_catalog_entry",
        target_type=catalog_kind,
        target_id=entry.id,
        payload=_catalog_entry_response(entry).model_dump(),
    )
    return _catalog_entry_response(entry)


@router.delete("/admin/{kind}/{entry_id}", response_model=AdminMutationStatus)
async def admin_delete_catalog_entry(
    kind: str,
    entry_id: str,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        catalog_kind = validate_catalog_kind(kind)
        normalized_id = normalize_catalog_id(entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not delete_catalog_record(db, kind=catalog_kind, entry_id=normalized_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found.")
    _record_admin_audit(
        db,
        admin=_admin,
        action="delete_catalog_entry",
        target_type=catalog_kind,
        target_id=normalized_id,
    )
    return AdminMutationStatus(status="ok", message="Catalog entry deleted.")


@router.get("/admin/health", response_model=AdminMutationStatus)
async def admin_health(_admin: User = Depends(require_admin)):
    return AdminMutationStatus(status="ok", message="Echoes of Empire admin console is available.")
