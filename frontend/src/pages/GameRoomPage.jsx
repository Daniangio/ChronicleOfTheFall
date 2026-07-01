import { Check, Eye, Hourglass, Landmark, LogOut, Minus, Plus, ScrollText, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CardVisual from "../components/CardVisual.jsx";
import CatalogItemVisual from "../components/CatalogItemVisual.jsx";
import TagIcon from "../components/TagIcon.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");

const buildLookup = (entries = []) => Object.fromEntries(entries.map((entry) => [normalize(entry.id), entry]));

const withResolvedTagIcon = (tag, imageLookup = {}) => {
  const imageId = tag?.data?.icon_image_id;
  const imageSrc = imageLookup?.[imageId]?.data?.src;
  if (!imageSrc || tag?.data?.icon) return tag;
  return { ...tag, data: { ...(tag.data || {}), icon: imageSrc } };
};

const buildTagLookup = (tags = [], imageLookup = {}) =>
  Object.fromEntries((tags || []).map((tag) => [normalize(tag.id), withResolvedTagIcon(tag, imageLookup)]));

const ProjectCard = ({ project, card, tagLookup, focusedPlayer, onAssign, canAssign = () => false }) => {
  const cost = card?.data?.cost || {};
  const contributions = project.contributions || {};
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{card?.name || project.card_id}</h3>
          <p className="mt-1 text-xs text-slate-500">{card?.category || "project"}</p>
        </div>
        <Hourglass className="h-4 w-4 text-slate-500" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(cost).map(([tagId, required]) => {
          const current = Number(contributions[tagId] || 0);
          const requiredCount = Math.max(0, Number(required) || 0);
          const available = Number(focusedPlayer?.mana?.[tagId] || 0);
          const complete = current >= requiredCount;
          return (
            <span key={tagId} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1" title={`${current}/${requiredCount} ${tagId}`}>
              <span className="inline-flex items-center gap-0.5">
                {Array.from({ length: requiredCount }).map((_, index) => (
                  <TagIcon
                    key={`${tagId}-${index}`}
                    tag={tagLookup[normalize(tagId)]}
                    label={tagId}
                    className={index < current ? "opacity-100" : "opacity-35"}
                  />
                ))}
              </span>
              <button
                className="rounded bg-slate-800 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-35"
                disabled={complete || available <= 0 || !canAssign(project.id, tagId)}
                onClick={() => onAssign(project.id, tagId)}
                type="button"
              >
                +1
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
};

const BuildOptionCard = ({ card, cityName, onBuild, disabled = false }) => (
  <button
    className="flex min-h-[10rem] flex-col rounded-lg border border-dashed border-teal-400/70 bg-teal-400/10 p-3 text-left opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-35"
    disabled={disabled}
    onClick={onBuild}
    type="button"
  >
    <span className="text-[0.65rem] font-semibold uppercase tracking-normal text-teal-200">Build Option</span>
    <span className="mt-3 text-sm font-semibold text-white">{card?.name || "Completed Project"}</span>
    <span className="mt-1 text-xs text-slate-400">{card?.category || "project"}</span>
    <span className="mt-auto rounded-md border border-teal-500/70 px-2 py-1 text-center text-xs font-semibold text-teal-100">
      Build in {cityName}
    </span>
  </button>
);

const FaceDownEventCard = ({ canPeek = false, onPeek, disabled = false }) => (
  <article className="flex aspect-[5/7] w-[clamp(12rem,16vw,15rem)] shrink-0 flex-col items-center justify-center rounded-lg border border-amber-900/70 bg-stone-950 p-4 text-center shadow-xl">
    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-800 bg-stone-900">
      <ScrollText className="h-8 w-8 text-amber-700" aria-hidden="true" />
    </div>
    <p className="mt-4 text-sm font-bold uppercase tracking-normal text-amber-100">Event</p>
    <p className="mt-1 text-xs text-amber-800">Face down</p>
    {canPeek ? (
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-md border border-amber-700 px-2 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-950/50 disabled:opacity-60"
        disabled={disabled}
        onClick={onPeek}
        type="button"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        Reconnaissance
      </button>
    ) : null}
  </article>
);

const slotPosition = (index, total) => {
  const fixed = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ];
  if (index < fixed.length) return fixed[index];
  const angle = ((index - fixed.length) / Math.max(1, total - fixed.length)) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * 1.45, y: Math.sin(angle) * 1.45 };
};

const CityMapZone = ({
  cityEntry,
  cityCard,
  cardLookup,
  tagLookup,
  buildActions,
  activePlayer,
  busy,
  hasAction,
  action,
}) => {
  const exhaustedIds = cityEntry.exhausted_card_ids || [];
  const cityCardId = cityEntry.city_card_id || cityEntry.foundation_card_id;
  const buildingSlots = Number(cityEntry.building_slots ?? cityCard?.data?.building_slots ?? 0);
  const placedCards = (cityEntry.cards || []).map((cardId, index) => ({ type: "card", cardId, index }));
  const buildOptions = (buildActions || []).map((entry, index) => ({ type: "build", entry, index }));
  const slotItems = [...placedCards, ...buildOptions];
  const visibleSlotCount = Math.max(buildingSlots, slotItems.length, 4);
  const radiusX = 210;
  const radiusY = 290;

  return (
    <section className="relative h-[54rem] w-[40rem] shrink-0 rounded-xl border border-amber-900/60 bg-stone-950/70 shadow-2xl">
      <div className="absolute left-5 top-5 z-10 rounded-md border border-amber-900/70 bg-stone-950/90 px-3 py-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <h2 className="text-sm font-bold text-amber-50">{cityEntry.name || "City"}</h2>
        </div>
        <p className="mt-1 text-[0.68rem] text-amber-700">
          Buildings {cityEntry.cards?.length || 0}/{buildingSlots || visibleSlotCount}
        </p>
      </div>

      <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        {cityCardId ? (
          <div className="rounded-xl border border-amber-600/50 bg-amber-950/20 p-2">
            <CardVisual
              card={cityCard}
              tagLookup={tagLookup}
              exhausted={exhaustedIds.includes(cityCardId)}
              canExhaust={hasAction("exhaust_card", (entry) => entry.card_id === cityCardId && entry.city_id === cityEntry.id)}
              disabled={busy}
              onExhaust={() => action("/actions/exhaust", {
                player_id: activePlayer.id,
                city_id: cityEntry.id,
                card_id: cityCardId,
              })}
            />
          </div>
        ) : (
          <div className="flex aspect-[5/7] w-[12rem] items-center justify-center rounded-xl border border-dashed border-amber-900/80 bg-stone-950 text-sm text-amber-800">
            Empty City
          </div>
        )}
      </div>

      {Array.from({ length: visibleSlotCount }).map((_, index) => {
        const position = slotPosition(index, visibleSlotCount);
        const item = slotItems[index];
        return (
          <div
            key={index}
            className="absolute left-1/2 top-1/2 flex aspect-[5/7] w-[11rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-dashed border-amber-900/55 bg-stone-900/45 p-2"
            style={{ transform: `translate(calc(-50% + ${position.x * radiusX}px), calc(-50% + ${position.y * radiusY}px))` }}
          >
            {item?.type === "card" ? (
              <CardVisual
                card={cardLookup[normalize(item.cardId)]}
                tagLookup={tagLookup}
                exhausted={exhaustedIds.includes(item.cardId)}
                canExhaust={hasAction("exhaust_card", (entry) => entry.card_id === item.cardId && entry.city_id === cityEntry.id)}
                disabled={busy}
                onExhaust={() => action("/actions/exhaust", { player_id: activePlayer.id, city_id: cityEntry.id, card_id: item.cardId })}
              />
            ) : item?.type === "build" ? (
              <div className="opacity-65 transition hover:opacity-100">
                <BuildOptionCard
                  card={cardLookup[normalize(item.entry.card_id)]}
                  cityName={cityEntry.name || "city"}
                  disabled={busy}
                  onBuild={() => action("/actions/build-project", {
                    player_id: activePlayer.id,
                    project_id: item.entry.project_id,
                    city_id: item.entry.city_id,
                  })}
                />
              </div>
            ) : (
              <span className="text-xs font-semibold uppercase text-amber-900/80">Slot</span>
            )}
          </div>
        );
      })}
    </section>
  );
};

const GameRoomPage = () => {
  const { roomId } = useParams();
  const { token } = useStore();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [focusedPlayerId, setFocusedPlayerId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [boardZoom, setBoardZoom] = useState(0.9);
  const [peekedEventId, setPeekedEventId] = useState("");

  const loadGame = useCallback(async () => {
    if (!token || !roomId) return;
    setError("");
    try {
      const [roomResponse, stateResponse] = await Promise.all([
        fetch(buildApiUrl(`/api/game/rooms/${roomId}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(buildApiUrl(`/api/game/rooms/${roomId}/state`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const roomPayload = await roomResponse.json().catch(() => ({}));
      const statePayload = await stateResponse.json().catch(() => ({}));
      if (!roomResponse.ok) throw new Error(roomPayload.detail || "Failed to load game room.");
      if (!stateResponse.ok) throw new Error(statePayload.detail || "Failed to load game state.");
      setRoom(roomPayload);
      setGameState(statePayload);
      setFocusedPlayerId(statePayload.active_player_id || statePayload.players?.[0]?.id || "");
      if (roomPayload.state === "FINISHED") navigate(`/games/${roomId}/post-game`, { replace: true });
    } catch (loadError) {
      setError(loadError.message || "Failed to load game.");
    }
  }, [navigate, roomId, token]);

  useEffect(() => {
    void loadGame();
  }, [loadGame]);

  const cardLookup = useMemo(() => buildLookup(gameState?.catalog?.cards || []), [gameState]);
  const imageLookup = useMemo(() => buildLookup(gameState?.catalog?.images || []), [gameState]);
  const tagLookup = useMemo(() => buildTagLookup(gameState?.catalog?.tags || [], imageLookup), [gameState, imageLookup]);
  const ministryLookup = useMemo(() => buildLookup(gameState?.catalog?.ministries || []), [gameState]);
  const ministries = gameState?.catalog?.ministries || [];
  const players = gameState?.players || [];
  const activePlayer = players.find((player) => player.id === gameState?.active_player_id);
  const focusedPlayer = players.find((player) => player.id === focusedPlayerId) || players[0];
  const cities = gameState?.cities || [];
  const eventLookup = useMemo(() => buildLookup(gameState?.catalog?.events || []), [gameState]);
  const possibleActions = gameState?.possible_actions || [];
  const phase = gameState?.phase || "administration";
  const selectedMinistries = gameState?.selected_ministries || {};
  const buildActions = possibleActions.filter((entry) => entry.type === "build_project");
  const newCityBuildActions = buildActions.filter((entry) => entry.city_id === "__new_city__");
  const cityZones = useMemo(() => cities.map((cityEntry) => ({
    city: cityEntry,
    cityCard: cardLookup[normalize(cityEntry.city_card_id || cityEntry.foundation_card_id)],
    buildActions: buildActions.filter((entry) => entry.city_id === cityEntry.id),
  })), [buildActions, cardLookup, cities]);
  const boardBaseWidth = Math.max(920, cityZones.length * 720);
  const boardBaseHeight = 850;

  const action = async (path, payload) => {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}${path}`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const nextState = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(nextState.detail || "Action failed.");
      setGameState(nextState);
      setFocusedPlayerId(nextState.active_player_id || nextState.players?.[0]?.id || "");
      return nextState;
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const hasAction = (type, matcher = () => true) =>
    possibleActions.some((entry) => entry.type === type && matcher(entry));

  const canContinuePhase = hasAction("continue_phase");
  const canPass = activePlayer && hasAction("pass", (entry) => entry.player_id === activePlayer.id);
  const ministryChoiceActions = possibleActions.filter((entry) => entry.type === "choose_ministry" && entry.player_id === activePlayer?.id);
  const peekedEvent = peekedEventId ? eventLookup[normalize(peekedEventId)] : null;

  const endGame = async () => {
    if (!token || !roomId || ending) return;
    setEnding(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}/end`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to end game.");
      navigate(`/games/${roomId}/post-game`);
    } catch (endError) {
      setError(endError.message || "Failed to end game.");
      setEnding(false);
    }
  };

  if (!gameState) {
    return (
      <main className="imperial-theme flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <p className="text-sm text-slate-400">{error || "Loading game..."}</p>
      </main>
    );
  }

  return (
    <main className="imperial-theme min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900/70 p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2 lg:block">
            <div>
              <p className="text-xs uppercase tracking-normal text-slate-500">Goldfishing</p>
              <p className="mt-1 text-sm font-semibold capitalize text-white">{phase.replace(/_/g, " ")}</p>
              <p className="mt-1 text-xs text-slate-500">Epoch {gameState.epoch || 1}</p>
              <p className="mt-1 text-xs text-slate-500">
                Sovereign {players.find((player) => player.id === gameState.minister_of_empire_player_id)?.name || "None"}
              </p>
              <p className="mt-1 break-all text-xs text-slate-500">{room?.id || roomId}</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              disabled={ending}
              onClick={endGame}
              type="button"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              End
            </button>
          </div>
          <div className="mt-5 grid gap-2">
            {players.map((player) => {
              const focused = focusedPlayer?.id === player.id;
              const active = activePlayer?.id === player.id;
              return (
                <button
                  key={player.id}
                  className={`rounded-lg border p-3 text-left transition ${
                    focused ? "border-teal-400 bg-teal-400/10" : "border-slate-800 bg-slate-950 hover:border-slate-600"
                  }`}
                  onClick={() => setFocusedPlayerId(player.id)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{player.name}</span>
                    {active ? <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-950">ACTIVE</span> : null}
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">{player.hand?.length || 0} cards</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {player.id === gameState.minister_of_empire_player_id
                      ? "Minister of the Empire"
                      : ministryLookup[normalize(selectedMinistries[player.id])]?.name || "Citizen"}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          {error ? <p className="m-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

          {phase !== "administration" ? (
            <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">Current Phase</p>
                <h1 className="mt-1 text-xl font-semibold capitalize text-white">{phase.replace(/_/g, " ")}</h1>
                {phase === "crisis" ? <p className="mt-1 text-xs text-slate-500">Step {gameState.crisis_step || 1}</p> : null}
                {phase === "council" ? <p className="mt-1 text-xs text-slate-500">Active choice: {activePlayer?.name || "None"}</p> : null}
              </div>
              {phase === "council" && ministryChoiceActions.length ? (
                <div className="flex flex-wrap gap-2">
                  {ministryChoiceActions.map((choice) => {
                    const ministry = ministryLookup[normalize(choice.ministry_id)];
                    return (
                      <button
                        key={choice.ministry_id}
                        className="rounded-md border border-amber-800 bg-stone-950 px-3 py-2 text-left text-sm font-semibold text-amber-100 hover:bg-amber-950/40 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => action("/actions/choose-ministry", { player_id: choice.player_id, ministry_id: choice.ministry_id })}
                        type="button"
                      >
                        {ministry?.name || choice.ministry_id}
                      </button>
                    );
                  })}
                </div>
              ) : canContinuePhase ? (
                <button
                  className="rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
                  disabled={busy}
                  onClick={() => action("/actions/continue-phase", {})}
                  type="button"
                >
                  Continue
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-white">Events</h2>
                    <p className="text-xs text-slate-500">Visual only in v0</p>
                  </div>
                  <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300">
                    Deck {gameState.event_deck?.length || 0}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {(gameState.event_queue || []).map((eventId, index) => {
                    const event = eventLookup[normalize(eventId)];
                    const canPeekEvent = hasAction("peek_event", (entry) => entry.event_id === eventId && entry.player_id === activePlayer?.id);
                    const faceUp = phase === "crisis" && Number(gameState.crisis_step || 0) === 2 && gameState.face_up_event_id === eventId;
                    return (
                      faceUp ? (
                        <CatalogItemVisual
                          key={`${eventId}-${index}`}
                          entry={event || { id: eventId, name: eventId, kind: "events", data: {} }}
                          tags={gameState.catalog?.tags || []}
                          ministries={ministries}
                          pillars={gameState.catalog?.pillars || []}
                          effectIcons={gameState.catalog?.effect_icons || []}
                        />
                      ) : (
                        <FaceDownEventCard
                          key={`${eventId}-${index}`}
                          canPeek={canPeekEvent}
                          disabled={busy}
                          onPeek={async () => {
                            const nextState = await action("/actions/peek-event", { player_id: activePlayer.id, event_id: eventId });
                            if (nextState) setPeekedEventId(eventId);
                          }}
                        />
                      )
                    );
                  })}
                  {(gameState.event_queue || []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-600">No active events.</p>
                  ) : null}
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
                  <div>
                    <h1 className="font-semibold text-white">Empire Map</h1>
                    <p className="text-xs text-slate-500">Active player: {activePlayer?.name || "None"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                      onClick={() => setBoardZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))}
                      type="button"
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="w-12 text-center text-xs font-semibold text-slate-400">{Math.round(boardZoom * 100)}%</span>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                      onClick={() => setBoardZoom((value) => Math.min(1.25, Number((value + 0.1).toFixed(2))))}
                      type="button"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="h-[35rem] overflow-auto bg-stone-950/60 p-6">
                  <div className="relative" style={{ width: boardBaseWidth * boardZoom, height: boardBaseHeight * boardZoom }}>
                    <div
                      className="absolute left-0 top-0 flex origin-top-left items-center gap-12 pr-12"
                      style={{ transform: `scale(${boardZoom})`, width: boardBaseWidth, height: boardBaseHeight }}
                    >
                      {cityZones.map(({ city: cityEntry, cityCard, buildActions: cityBuildActions }) => (
                        <CityMapZone
                          key={cityEntry.id}
                          cityEntry={cityEntry}
                          cityCard={cityCard}
                          cardLookup={cardLookup}
                          tagLookup={tagLookup}
                          buildActions={cityBuildActions}
                          activePlayer={activePlayer}
                          busy={busy}
                          hasAction={hasAction}
                          action={action}
                        />
                      ))}
                      {cityZones.length === 0 ? (
                        <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
                          No city zones available.
                        </section>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
              {newCityBuildActions.length ? (
                <section className="rounded-lg border border-teal-900/70 bg-teal-950/20 p-4">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-teal-300" aria-hidden="true" />
                    <h2 className="font-semibold text-white">New City</h2>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {newCityBuildActions.map((entry) => (
                      <BuildOptionCard
                        key={`${entry.project_id}-${entry.card_id}`}
                        card={cardLookup[normalize(entry.card_id)]}
                        cityName="new city"
                        disabled={busy}
                        onBuild={() => action("/actions/build-project", {
                          player_id: activePlayer.id,
                          project_id: entry.project_id,
                          city_id: entry.city_id,
                        })}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="font-semibold text-white">Projects</h2>
              <div className="mt-3 space-y-3">
                {(gameState.projects || []).map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    card={cardLookup[normalize(project.card_id)]}
                    tagLookup={tagLookup}
                    focusedPlayer={focusedPlayer}
                    onAssign={(projectId, tagId) => action("/actions/assign-mana", {
                      player_id: focusedPlayer.id,
                      project_id: projectId,
                      tag_id: tagId,
                      amount: 1,
                    })}
                    canAssign={(projectId, tagId) => hasAction("assign_mana", (entry) => entry.project_id === projectId && entry.tag_id === tagId)}
                  />
                ))}
                {Array.from({ length: Math.max(0, 3 - (gameState.projects?.length || 0)) }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-dashed border-slate-800 p-5 text-center text-sm text-slate-600">
                    Empty project slot
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <section className="border-t border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-5 gap-y-2">
                <div>
                  <h2 className="text-lg font-semibold text-white">{focusedPlayer?.name || "Player"}</h2>
                  <p className="text-xs text-slate-500">
                    {focusedPlayer?.id === activePlayer?.id ? "Active player board" : "Focused player board"}
                    {" · "}
                    {focusedPlayer?.id === gameState.minister_of_empire_player_id
                      ? "Minister of the Empire"
                      : ministryLookup[normalize(selectedMinistries[focusedPlayer?.id])]?.name || "Citizen"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {Object.entries(focusedPlayer?.mana || {}).map(([tagId, count]) => (
                    <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={count} />
                  ))}
                  {Object.keys(focusedPlayer?.mana || {}).length === 0 ? <span className="text-xs text-slate-600">No mana</span> : null}
                </div>
              </div>
              {focusedPlayer?.id === activePlayer?.id && canPass ? (
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  disabled={busy}
                  onClick={() => action("/actions/pass", { player_id: activePlayer.id })}
                  type="button"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Pass
                </button>
              ) : null}
            </div>
            {focusedPlayer?.id === activePlayer?.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {possibleActions.filter((entry) => entry.type === "use_ministry_resource" && entry.player_id === activePlayer.id).map((entry) => (
                  <button
                    key={`${entry.tag_id}-${entry.amount}`}
                    className="inline-flex items-center gap-2 rounded-md border border-teal-700 px-3 py-2 text-sm text-teal-100 hover:bg-teal-900/40 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => action("/actions/ministry-resource", { player_id: activePlayer.id, tag_id: entry.tag_id })}
                    type="button"
                  >
                    Ministry
                    <TagIcon tag={tagLookup[normalize(entry.tag_id)]} label={entry.tag_id} count={entry.amount} />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-slate-500">Hand</h3>
                <div className="flex flex-wrap gap-3">
                  {(focusedPlayer?.hand || []).map((cardId, index) => (
                    <CardVisual
                      key={`${cardId}-${index}`}
                      card={cardLookup[normalize(cardId)]}
                      tagLookup={tagLookup}
                      size="hand"
                      disabled={busy}
                      canPropose={hasAction("propose_project", (entry) => entry.card_id === cardId && entry.player_id === focusedPlayer?.id && entry.source === "hand")}
                      onPropose={() => action("/actions/propose", { player_id: focusedPlayer.id, card_id: cardId })}
                    />
                  ))}
                  {(focusedPlayer?.hand || []).length === 0 ? (
                    <p className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-sm text-slate-500">Hand is empty.</p>
                  ) : null}
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-slate-500">Common Pool</h3>
                <div className="flex flex-wrap gap-3">
                  {(gameState.common_pool || []).map((cardId, index) => (
                    <CardVisual
                      key={`${cardId}-${index}`}
                      card={cardLookup[normalize(cardId)]}
                      tagLookup={tagLookup}
                      size="hand"
                      disabled={busy}
                      canPropose={hasAction("propose_project", (entry) => entry.card_id === cardId && entry.player_id === focusedPlayer?.id && entry.source === "common_pool")}
                      onPropose={() => action("/actions/propose", { player_id: focusedPlayer.id, card_id: cardId })}
                    />
                  ))}
                  {(gameState.common_pool || []).length === 0 ? (
                    <p className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-sm text-slate-500">Common pool is empty.</p>
                  ) : null}
                </div>
              </section>
            </div>
          </section>
        </section>
      </div>
      {peekedEventId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6">
          <div className="relative max-h-full max-w-[min(92vw,36rem)] overflow-auto rounded-xl border border-amber-900 bg-stone-950 p-5 shadow-2xl">
            <button
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
              onClick={() => setPeekedEventId("")}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="mb-3 pr-10 text-xs font-semibold uppercase tracking-normal text-amber-700">Reconnaissance</p>
            <CatalogItemVisual
              entry={peekedEvent || { id: peekedEventId, name: peekedEventId, kind: "events", data: {} }}
              tags={gameState.catalog?.tags || []}
              ministries={ministries}
              pillars={gameState.catalog?.pillars || []}
              effectIcons={gameState.catalog?.effect_icons || []}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default GameRoomPage;
