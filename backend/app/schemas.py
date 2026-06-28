from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserPublic(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_admin: bool = False
    online: bool = False


class PlayerProfile(BaseModel):
    user: UserPublic
    is_self: bool = False
    friend_status: str = "none"
    friends_count: int = 0


class FriendUserSummary(BaseModel):
    id: str
    username: str


class FriendRequestCreate(BaseModel):
    username: Optional[str] = None
    target_user_id: Optional[str] = None


class FriendRequestRespond(BaseModel):
    accept: bool


class FriendListEntry(BaseModel):
    user: FriendUserSummary
    since: Optional[datetime] = None


class PendingFriendRequestEntry(BaseModel):
    request_id: str
    user: FriendUserSummary
    created_at: datetime


class FriendsSummaryResponse(BaseModel):
    friends: List[FriendListEntry]
    incoming_requests: List[PendingFriendRequestEntry]
    outgoing_requests: List[PendingFriendRequestEntry]


class SessionStateResponse(BaseModel):
    user_id: str


class LobbyStateResponse(BaseModel):
    users: List[UserPublic]


class GameRoomCreateRequest(BaseModel):
    mode: str = "solo"
    game_type: str = "chronicle_solo"
    empire_deck_id: Optional[str] = None
    event_deck_id: Optional[str] = None


class GameRoomResponse(BaseModel):
    id: str
    owner_user_id: str
    mode: str
    game_type: str
    state: str
    created_at: str
    started_at: str
    ended_at: Optional[str] = None
    result_id: Optional[str] = None


class GameResultResponse(BaseModel):
    id: str
    room_id: str
    mode: str
    game_type: str
    outcome: str
    maturity: int
    turns: int
    duration_seconds: int
    summary: str
    created_at: str


class GameHistoryResponse(BaseModel):
    results: List[GameResultResponse]


class GoldfishingProposeRequest(BaseModel):
    player_id: str
    card_id: str


class GoldfishingExhaustRequest(BaseModel):
    player_id: str
    city_id: str
    card_id: str


class GoldfishingAssignManaRequest(BaseModel):
    player_id: str
    project_id: str
    tag_id: str
    amount: int = Field(default=1, ge=1)
    city_id: str = "capital"


class GoldfishingBuildProjectRequest(BaseModel):
    player_id: str
    project_id: str
    city_id: str = "capital"


class GoldfishingMinistryResourceRequest(BaseModel):
    player_id: str
    tag_id: str


class GoldfishingPassRequest(BaseModel):
    player_id: str


class AuthMeResponse(BaseModel):
    uid: str
    email: Optional[str] = None
    username: str
    auth_provider: Optional[str] = None
    player_exists: bool
    is_admin: bool = False


class AdminUserSummary(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_admin: bool
    online: bool = False


class AdminUserAdminUpdate(BaseModel):
    is_admin: bool


class AdminUserDetail(BaseModel):
    user: UserPublic
    friends_count: int = 0
    incoming_requests_count: int = 0
    outgoing_requests_count: int = 0


class AdminMutationStatus(BaseModel):
    status: str
    message: Optional[str] = None


class AdminAuditLogEntry(BaseModel):
    id: str
    admin_user_id: str
    admin_username: str
    action: str
    target_type: str
    target_id: str
    payload: Dict[str, Any]
    created_at: datetime


class AdminCatalogEntry(BaseModel):
    id: str
    name: str
    kind: str
    category: str
    summary: str
    color: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class AdminCatalogEntryCreate(BaseModel):
    id: Optional[str] = None
    name: str
    category: str = ""
    summary: str = ""
    color: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class AdminCatalogEntryUpdate(BaseModel):
    name: str
    category: str = ""
    summary: str = ""
    color: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class AdminCatalogImportEntry(BaseModel):
    id: str
    kind: str
    name: str
    category: str = ""
    summary: str = ""
    color: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class AdminCatalogImportPayload(BaseModel):
    version: int = 1
    kind: Optional[str] = None
    entries: List[AdminCatalogImportEntry] = Field(default_factory=list)


class AdminCatalogImportResult(BaseModel):
    status: str
    created: int = 0
    updated: int = 0
    skipped: int = 0


class AdminCatalogSummary(BaseModel):
    tags: int = 0
    cards: int = 0
    ministries: int = 0
    event_types: int = 0
    agendas: int = 0
    events: int = 0
    groups: int = 0
    card_categories: int = 0
    decks: int = 0
