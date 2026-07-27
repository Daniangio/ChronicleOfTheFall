import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Castle,
  Check,
  Crown,
  LogOut,
  Minus,
  Plus,
  Shield,
  Users,
  Vote,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import CardVisual from "../components/CardVisual.jsx";
import CatalogItemVisual from "../components/CatalogItemVisual.jsx";
import TagIcon from "../components/TagIcon.jsx";
import { useStore } from "../store.js";
import { buildApiUrl, buildAssetUrl } from "../utils/connection.js";

const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
const lookup = (entries = []) => Object.fromEntries(entries.map((entry) => [normalize(entry.id), entry]));
const titleCase = (value) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const withResolvedTagIcon = (tag, imageLookup = {}) => {
  const imageSrc = imageLookup?.[tag?.data?.icon_image_id]?.data?.src;
  return imageSrc && !tag?.data?.icon ? { ...tag, data: { ...(tag.data || {}), icon: imageSrc } } : tag;
};

const buildTagLookup = (tags = [], imageLookup = {}) =>
  Object.fromEntries(tags.map((tag) => [normalize(tag.id), withResolvedTagIcon(tag, imageLookup)]));

const ItemVisual = ({ item, catalogs, tagLookup, storageIconSrc = "", actionLabel = "", onAction, disabled = false }) => {
  if (!item) return null;
  const tokenLookup = buildTagLookup(catalogs.tokens, lookup(catalogs.images));
  if (item.kind === "events") {
    return (
      <div className="space-y-2">
        <CatalogItemVisual
          entry={item}
          tags={catalogs.tags}
          cards={catalogs.cards}
          ministries={catalogs.ministries}
          images={catalogs.images}
          pillars={catalogs.pillars}
          tokens={catalogs.tokens}
          effectIcons={catalogs.effect_icons}
        />
        {actionLabel ? (
          <button
            className="w-full rounded-md bg-amber-300 px-3 py-2 text-xs font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50"
            disabled={disabled}
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <CardVisual
      card={item}
      tagLookup={tagLookup}
      pillarLookup={lookup(catalogs.pillars)}
      tokenLookup={tokenLookup}
      storageIconSrc={storageIconSrc}
      size="hand"
      canAct={Boolean(actionLabel)}
      actionLabel={actionLabel}
      onAction={onAction}
      disabled={disabled}
    />
  );
};

const slotPosition = (index, total) => {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

const CityZone = ({ city, cardLookup, tagLookup, pillarLookup, tokenLookup, storageIconSrc }) => {
  const cityCard = cardLookup[normalize(city.city_card_id)];
  const buildings = (city.cards || []).map((cardId) => cardLookup[normalize(cardId)]).filter(Boolean);
  const slots = Math.max(1, Number(city.building_slots || 0), buildings.length);
  return (
    <section className="relative h-[46rem] w-[35rem] shrink-0 border border-amber-900/50 bg-stone-950/65">
      <div className="absolute left-4 top-4 z-20">
        <div className="flex items-center gap-2 text-amber-100">
          <Castle className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h3 className="text-sm font-bold">{city.name}</h3>
        </div>
        <p className="mt-1 text-xs text-amber-800">{buildings.length}/{city.building_slots || 0} building slots</p>
      </div>
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <CardVisual card={cityCard} tagLookup={tagLookup} pillarLookup={pillarLookup} tokenLookup={tokenLookup} storageIconSrc={storageIconSrc} />
      </div>
      {Array.from({ length: slots }).map((_, index) => {
        const position = slotPosition(index, slots);
        const building = buildings[index];
        return (
          <div
            key={`${city.id}-${index}`}
            className="absolute left-1/2 top-1/2 flex aspect-[5/7] w-[11rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-dashed border-amber-900/55 bg-stone-900/45 p-1.5"
            style={{ transform: `translate(calc(-50% + ${position.x * 190}px), calc(-50% + ${position.y * 265}px))` }}
          >
            {building ? (
              <CardVisual card={building} tagLookup={tagLookup} pillarLookup={pillarLookup} tokenLookup={tokenLookup} storageIconSrc={storageIconSrc} />
            ) : (
              <span className="text-[0.65rem] font-semibold uppercase text-amber-900">Building slot</span>
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
  const [storageSelection, setStorageSelection] = useState({});
  const [boardZoom, setBoardZoom] = useState(0.82);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  const loadGame = useCallback(async () => {
    if (!token || !roomId) return;
    setError("");
    try {
      const [roomResponse, stateResponse] = await Promise.all([
        fetch(buildApiUrl(`/api/game/rooms/${roomId}`), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildApiUrl(`/api/game/rooms/${roomId}/state`), { headers: { Authorization: `Bearer ${token}` } }),
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

  useEffect(() => {
    setStorageSelection({});
  }, [gameState?.phase, gameState?.era]);

  const catalogs = {
    cards: gameState?.catalog?.cards || [],
    tags: gameState?.catalog?.tags || [],
    events: gameState?.catalog?.events || [],
    ministries: gameState?.catalog?.ministries || [],
    images: gameState?.catalog?.images || [],
    pillars: gameState?.catalog?.pillars || [],
    tokens: gameState?.catalog?.tokens || [],
    effect_icons: gameState?.catalog?.effect_icons || [],
    agendas: gameState?.catalog?.agendas || [],
  };
  const cardLookup = useMemo(() => lookup(catalogs.cards), [gameState]);
  const eventLookup = useMemo(() => lookup(catalogs.events), [gameState]);
  const itemLookup = useMemo(() => ({ ...cardLookup, ...eventLookup }), [cardLookup, eventLookup]);
  const ministryLookup = useMemo(() => lookup(catalogs.ministries), [gameState]);
  const pillarLookup = useMemo(() => lookup(catalogs.pillars), [gameState]);
  const agendaLookup = useMemo(() => lookup(catalogs.agendas), [gameState]);
  const imageLookup = useMemo(() => lookup(catalogs.images), [gameState]);
  const tagLookup = useMemo(() => buildTagLookup(catalogs.tags, imageLookup), [gameState, imageLookup]);
  const tokenLookup = useMemo(() => buildTagLookup(catalogs.tokens, imageLookup), [gameState, imageLookup]);
  const storageIconSrc = useMemo(() => {
    const icon = catalogs.effect_icons.find((entry) => entry.data?.effect_type === "storage");
    const src = imageLookup[icon?.data?.icon_image_id]?.data?.src || "";
    return buildAssetUrl(src);
  }, [gameState, imageLookup]);
  const players = gameState?.players || [];
  const activePlayer = players.find((player) => player.id === gameState?.active_player_id);
  const focusedPlayer = players.find((player) => player.id === focusedPlayerId) || activePlayer || players[0];
  const actions = gameState?.possible_actions || [];
  const phase = gameState?.phase || "ministry_assignment";

  const perform = async (action, payload = {}) => {
    if (!token || busy) return null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}/actions`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
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

  const performAction = (entry, extra = {}) => {
    const { type, ...payload } = entry;
    return perform(type, { ...payload, ...extra });
  };

  const endGame = async () => {
    if (!token || ending) return;
    setEnding(true);
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
    return <main className="imperial-theme flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">{error || "Loading game..."}</main>;
  }

  const ministryNamesFor = (playerId) =>
    Object.entries(gameState.ministry_assignments || {})
      .filter(([, holder]) => holder === playerId)
      .map(([ministryId]) => ministryLookup[normalize(ministryId)]?.name || ministryId);
  const currentReveal = gameState.current_reveal;
  const currentCrisis = eventLookup[normalize(gameState.current_crisis_id)];
  const storageAction = actions.find((entry) => entry.type === "store_resources");
  const resourcePool = gameState.global_resource_pool || {};
  const selectedStorageTotal = Object.values(storageSelection).reduce((total, amount) => total + Number(amount || 0), 0);
  const boardWidth = Math.max(760, (gameState.cities?.length || 1) * 610);

  const renderPhaseControls = () => {
    const conversionChoices = actions.filter((entry) => entry.type === "choose_event_conversion_resource");
    if (conversionChoices.length) {
      const stage = conversionChoices[0].stage;
      return (
        <div>
          <p className="mb-2 text-sm font-semibold text-amber-100">
            Choose the {stage === "source" ? "resource to convert" : "destination resource"}
          </p>
          <div className="flex flex-wrap gap-2">
            {conversionChoices.map((entry) => (
              <button
                key={entry.resource_id}
                className="rounded-md border border-amber-800 bg-stone-950 p-2 hover:bg-amber-950/50 disabled:opacity-50"
                disabled={busy}
                onClick={() => performAction(entry)}
                title={tagLookup[normalize(entry.resource_id)]?.name || entry.resource_id}
                type="button"
              >
                <TagIcon tag={tagLookup[normalize(entry.resource_id)]} label={entry.resource_id} size="sm" />
              </button>
            ))}
          </div>
        </div>
      );
    }
    const resourceChoices = actions.filter((entry) => entry.type === "choose_event_resource");
    if (resourceChoices.length) {
      const amount = Number(resourceChoices[0].amount || 0);
      return (
        <div>
          <p className="mb-2 text-sm font-semibold text-amber-100">
            Minister of Health & Harvest: choose a resource to {amount >= 0 ? "add" : "remove"}
          </p>
          <div className="flex flex-wrap gap-2">
            {resourceChoices.map((entry) => (
              <button
                key={entry.resource_id}
                className="rounded-md border border-amber-800 bg-stone-950 p-2 hover:bg-amber-950/50 disabled:opacity-50"
                disabled={busy}
                onClick={() => performAction(entry)}
                title={`${amount >= 0 ? "+" : ""}${amount} ${tagLookup[normalize(entry.resource_id)]?.name || entry.resource_id}`}
                type="button"
              >
                <TagIcon tag={tagLookup[normalize(entry.resource_id)]} label={entry.resource_id} size="sm" />
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (phase === "ministry_assignment") {
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => (
            <button key={entry.ministry_id} className="rounded-md border border-amber-800 bg-stone-950 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">
              {ministryLookup[normalize(entry.ministry_id)]?.name || entry.ministry_id}
            </button>
          ))}
        </div>
      );
    }
    if (phase === "suspicion") {
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => {
            const target = players.find((player) => player.id === entry.target_player_id);
            return (
              <button key={entry.target_player_id || "none"} className="rounded-md border border-rose-900 px-3 py-2 text-sm text-rose-100 hover:bg-rose-950/50 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">
                {target ? `Suspect ${target.name}` : "Suspect no one"}
              </button>
            );
          })}
        </div>
      );
    }
    if (["production", "queued_projects"].includes(phase) && actions.some((entry) => entry.type === "continue_phase")) {
      return <button className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50" disabled={busy} onClick={() => perform("continue_phase")} type="button">Resolve phase</button>;
    }
    if (phase === "docket_ordering") {
      const confirmAction = actions.find((entry) => entry.type === "confirm_docket_order");
      return (
        <button
          className="inline-flex items-center gap-2 rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50"
          disabled={busy || !confirmAction}
          onClick={() => performAction(confirmAction)}
          type="button"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Confirm Docket order
        </button>
      );
    }
    if (phase === "reveal" && actions.some((entry) => entry.type === "reveal_next")) {
      return <button className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50" disabled={busy} onClick={() => perform("reveal_next")} type="button">{gameState.council_stack?.length ? "Reveal next card" : "Finish reveal"}</button>;
    }
    if (["queued_projects", "reveal"].includes(phase) && actions.some((entry) => entry.city_id)) {
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => {
            const city = gameState.cities.find((item) => item.id === entry.city_id);
            return <button key={entry.city_id} className="rounded-md bg-teal-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">{entry.city_id === "__new_city__" ? "Found new city" : `Build in ${city?.name || entry.city_id}`}</button>;
          })}
        </div>
      );
    }
    if (phase === "stalled_vote") {
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => {
            const project = gameState.stalled_projects.find((item) => item.id === entry.project_id);
            return <button key={entry.project_id || "none"} className="inline-flex items-center gap-2 rounded-md border border-teal-800 px-3 py-2 text-sm text-teal-100 hover:bg-teal-950/50 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button"><Vote className="h-4 w-4" aria-hidden="true" />{project ? itemLookup[normalize(project.card_id)]?.name || project.card_id : "Abstain"}</button>;
          })}
        </div>
      );
    }
    if (phase === "crisis") {
      if (!gameState.current_crisis_id) {
        return <button className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50" disabled={busy} onClick={() => perform("continue_phase")} type="button">Continue to Storage</button>;
      }
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => (
            <button key={String(entry.use_war_power)} className="inline-flex items-center gap-2 rounded-md border border-rose-800 bg-rose-950/30 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-950/60 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">
              <Shield className="h-4 w-4" aria-hidden="true" />
              {entry.use_war_power ? "Resolve with War Minister" : "Resolve without War power"}
            </button>
          ))}
        </div>
      );
    }
    if (phase === "storage") {
      if (!storageAction) {
        return <button className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50" disabled={busy} onClick={() => perform("continue_phase")} type="button">Discard leftovers</button>;
      }
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(resourcePool).map(([resourceId, available]) => {
              const selected = Number(storageSelection[resourceId] || 0);
              return (
                <div key={resourceId} className="flex items-center gap-2 border border-slate-700 bg-slate-950 px-2 py-1.5">
                  <TagIcon tag={tagLookup[normalize(resourceId)]} label={resourceId} size="sm" />
                  <button className="h-7 w-7 border border-slate-700 text-slate-300 disabled:opacity-30" disabled={selected <= 0} onClick={() => setStorageSelection((current) => ({ ...current, [resourceId]: Math.max(0, selected - 1) }))} type="button"><Minus className="mx-auto h-3 w-3" /></button>
                  <span className="w-10 text-center text-xs">{selected}/{available}</span>
                  <button className="h-7 w-7 border border-slate-700 text-slate-300 disabled:opacity-30" disabled={selected >= Number(available)} onClick={() => setStorageSelection((current) => ({ ...current, [resourceId]: selected + 1 }))} type="button"><Plus className="mx-auto h-3 w-3" /></button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-400">Selected {selectedStorageTotal}. Generic capacity {storageAction.generic_capacity}; specific capacity {Object.entries(storageAction.specific_capacity || {}).map(([id, value]) => `${id} ${value}`).join(", ") || "none"}.</p>
            <button className="rounded-md bg-teal-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-50" disabled={busy} onClick={() => performAction(storageAction, { resources: storageSelection })} type="button">Store selection</button>
          </div>
        </div>
      );
    }
    if (phase === "cleanup") {
      const none = actions.find((entry) => entry.type === "cleanup_scheme" && entry.mode === "none");
      return none ? <button className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => performAction(none)} type="button">No Scheme change</button> : <p className="text-sm text-rose-200">Discard one card from the active hand.</p>;
    }
    return null;
  };

  return (
    <main className="imperial-theme min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900/75 p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-amber-700">Anonymous Council</p>
              <h1 className="mt-1 text-base font-bold text-amber-50">Era {gameState.era}</h1>
              <p className="mt-1 text-xs text-slate-500">{titleCase(phase)}</p>
            </div>
            <button className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50" disabled={ending} onClick={endGame} title="End game" type="button"><LogOut className="h-4 w-4" /></button>
          </div>
          <div className="mt-5 space-y-2">
            {players.map((player) => {
              const focused = player.id === focusedPlayer?.id;
              const active = player.id === activePlayer?.id;
              const ministries = ministryNamesFor(player.id);
              return (
                <button key={player.id} className={`w-full border p-3 text-left ${focused ? "border-amber-500 bg-amber-950/25" : "border-slate-800 bg-slate-950 hover:border-slate-600"}`} onClick={() => setFocusedPlayerId(player.id)} type="button">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{player.name}</span>
                    {active ? <span className="bg-amber-300 px-1.5 py-0.5 text-[0.6rem] font-bold text-stone-950">DECIDING</span> : null}
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">Hand {player.hand?.length || 0} · Suspicion {player.suspicion || 0}</span>
                  <span className="mt-1 block text-[0.65rem] leading-4 text-amber-700">{ministries.join(" · ") || "No ministry"}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0">
          {error ? <p className="m-4 border border-rose-900 bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

          <header className="m-4 border border-amber-900/60 bg-stone-950/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-amber-700">Current Phase</p>
                <h2 className="mt-1 text-xl font-bold text-amber-50">{titleCase(phase)}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {activePlayer
                    ? `${activePlayer.name} is deciding`
                    : gameState.winner_player_ids?.length
                      ? `Winners: ${gameState.winner_player_ids.map((playerId) => players.find((player) => player.id === playerId)?.name || playerId).join(", ")}`
                      : "The Empire has fallen"}
                </p>
              </div>
              <div className="max-w-3xl">{renderPhaseControls()}</div>
            </div>
          </header>

          <div className="grid gap-4 px-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="min-w-0 space-y-4">
              <section className="grid gap-3 md:grid-cols-3">
                <div className="border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center gap-2 text-slate-400"><Crown className="h-4 w-4 text-amber-400" /><span className="text-xs font-bold uppercase">Pillars</span></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(gameState.pillars || {}).map(([pillarId, value]) => (
                      <span key={pillarId} className="border border-amber-900/60 bg-stone-950 px-2 py-1 text-xs text-amber-100" title={pillarLookup[normalize(pillarId)]?.name || pillarId}>{pillarLookup[normalize(pillarId)]?.name || titleCase(pillarId)} <strong>{value}</strong></span>
                    ))}
                  </div>
                </div>
                <div className="border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center gap-2 text-slate-400"><Archive className="h-4 w-4 text-teal-400" /><span className="text-xs font-bold uppercase">Global Resources</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(resourcePool).map(([tagId, amount]) => <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={amount} size="sm" />)}
                    {!Object.keys(resourcePool).length ? <span className="text-xs text-slate-600">Empty</span> : null}
                  </div>
                </div>
                <div className="border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center gap-2 text-slate-400"><Users className="h-4 w-4 text-rose-400" /><span className="text-xs font-bold uppercase">Empire Tags</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(gameState.empire_tags || {}).map(([tagId, amount]) => <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={amount} size="sm" />)}
                    {!Object.keys(gameState.empire_tags || {}).length ? <span className="text-xs text-slate-600">None</span> : null}
                  </div>
                </div>
              </section>

              {currentCrisis ? (
                <section className="border border-rose-900/70 bg-rose-950/15 p-4">
                  <h2 className="mb-3 text-sm font-bold uppercase text-rose-200">Current Crisis</h2>
                  <CatalogItemVisual entry={currentCrisis} tags={catalogs.tags} ministries={catalogs.ministries} images={catalogs.images} pillars={catalogs.pillars} effectIcons={catalogs.effect_icons} />
                </section>
              ) : null}

              <section className="border border-slate-800 bg-slate-900">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
                  <div>
                    <h2 className="font-bold text-white">Empire Map</h2>
                    <p className="text-xs text-slate-500">Cities and their building slots</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="h-8 w-8 border border-slate-700 hover:bg-slate-800" onClick={() => setBoardZoom((value) => Math.max(0.55, value - 0.1))} title="Zoom out" type="button"><Minus className="mx-auto h-4 w-4" /></button>
                    <span className="w-11 text-center text-xs text-slate-400">{Math.round(boardZoom * 100)}%</span>
                    <button className="h-8 w-8 border border-slate-700 hover:bg-slate-800" onClick={() => setBoardZoom((value) => Math.min(1.2, value + 0.1))} title="Zoom in" type="button"><Plus className="mx-auto h-4 w-4" /></button>
                  </div>
                </div>
                <div className="h-[38rem] overflow-auto bg-stone-950/60 p-5">
                  <div className="relative" style={{ width: boardWidth * boardZoom, height: 760 * boardZoom }}>
                    <div className="absolute left-0 top-0 flex origin-top-left gap-8" style={{ width: boardWidth, height: 760, transform: `scale(${boardZoom})` }}>
                      {(gameState.cities || []).map((city) => <CityZone key={city.id} city={city} cardLookup={cardLookup} tagLookup={tagLookup} pillarLookup={pillarLookup} tokenLookup={tokenLookup} storageIconSrc={storageIconSrc} />)}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="border border-slate-800 bg-slate-900 p-3">
                <h2 className="text-sm font-bold text-white">Council Docket</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {phase === "docket_ordering"
                    ? "The Minister of the Empire decides the resolution order."
                    : `${gameState.council_stack?.length || 0} cards remain`}
                </p>
                <div className="mt-3 flex max-h-[22rem] flex-wrap gap-2 overflow-auto">
                  {(gameState.council_stack || []).map((commitment, index) => {
                    const moveLeft = actions.find((entry) =>
                      entry.type === "move_docket_card"
                      && entry.commitment_id === commitment.id
                      && entry.direction === -1
                    );
                    const moveRight = actions.find((entry) =>
                      entry.type === "move_docket_card"
                      && entry.commitment_id === commitment.id
                      && entry.direction === 1
                    );
                    return (
                      <div key={commitment.id} className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Order {index + 1}</span>
                          {commitment.face_up ? (
                            <span>{players.find((player) => player.id === commitment.owner_player_id)?.name}</span>
                          ) : <span>Anonymous</span>}
                        </div>
                        <ItemVisual item={itemLookup[normalize(commitment.item_id)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                        {phase === "docket_ordering" ? (
                          <div className="flex justify-center gap-2">
                            <button
                              className="h-8 w-8 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                              disabled={busy || !moveLeft}
                              onClick={() => performAction(moveLeft)}
                              title="Resolve earlier"
                              type="button"
                            >
                              <ArrowLeft className="mx-auto h-4 w-4" aria-hidden="true" />
                            </button>
                            <button
                              className="h-8 w-8 border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                              disabled={busy || !moveRight}
                              onClick={() => performAction(moveRight)}
                              title="Resolve later"
                              type="button"
                            >
                              <ArrowRight className="mx-auto h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!gameState.council_stack?.length ? <p className="text-xs text-slate-600">No committed cards.</p> : null}
                </div>
              </section>
              {currentReveal ? (
                <section className="border border-amber-900/60 bg-stone-950 p-3">
                  <h2 className="mb-2 text-sm font-bold text-amber-100">Current Reveal · {titleCase(currentReveal.status)}</h2>
                  <ItemVisual item={itemLookup[normalize(currentReveal.item_id)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                  {currentReveal.face_up ? <p className="mt-2 text-xs text-amber-700">Committed by {players.find((player) => player.id === currentReveal.owner_player_id)?.name}</p> : null}
                </section>
              ) : null}
              <section className="border border-slate-800 bg-slate-900 p-3">
                <h2 className="text-sm font-bold text-white">Projects</h2>
                <div className="mt-3 space-y-3">
                  {[...(gameState.queued_projects || []).map((project) => ({ ...project, row: "Queued" })), ...(gameState.stalled_projects || []).map((project) => ({ ...project, row: "Stalled" }))].map((project) => (
                    <div key={project.id}>
                      <p className="mb-1 text-[0.65rem] font-bold uppercase text-slate-500">{project.row}</p>
                      <ItemVisual item={itemLookup[normalize(project.card_id)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                    </div>
                  ))}
                  {!gameState.queued_projects?.length && !gameState.stalled_projects?.length ? <p className="text-xs text-slate-600">No projects.</p> : null}
                </div>
              </section>
            </aside>
          </div>

          <section className="mt-4 border-t border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{focusedPlayer?.name || "Player"}</h2>
                <p className="text-xs text-slate-500">{ministryNamesFor(focusedPlayer?.id).join(" · ") || "No ministry"} · Suspicion {focusedPlayer?.suspicion || 0}</p>
                {focusedPlayer?.hidden_agenda_id ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Hidden Agenda: {agendaLookup[normalize(focusedPlayer.hidden_agenda_id)]?.name || focusedPlayer.hidden_agenda_id}
                    {gameState.agendas_revealed && gameState.winner_player_ids?.includes(focusedPlayer.id) ? " · Satisfied" : ""}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">Hand limit 5 · Scheme slots 2</p>
            </div>
            <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Hand</h3>
                <div className="flex flex-wrap gap-3">
                  {(focusedPlayer?.hand || []).map((itemId, index) => {
                    const plottingAction = actions.find((entry) => entry.type === "commit_card" && entry.source === "hand" && entry.index === index && entry.player_id === focusedPlayer.id);
                    const discardAction = actions.find((entry) => entry.type === "cleanup_discard" && entry.hand_index === index && entry.player_id === focusedPlayer.id);
                    const schemeActions = actions.filter((entry) => entry.type === "cleanup_scheme" && entry.hand_index === index && entry.player_id === focusedPlayer.id);
                    const primary = plottingAction || discardAction;
                    return (
                      <div key={`${itemId}-${index}`} className="space-y-2">
                        <ItemVisual
                          item={itemLookup[normalize(itemId)]}
                          catalogs={catalogs}
                          tagLookup={tagLookup}
                          storageIconSrc={storageIconSrc}
                          actionLabel={primary ? plottingAction ? (plottingAction.face_up ? "Commit face up" : "Commit anonymously") : "Discard" : ""}
                          onAction={() => performAction(primary)}
                          disabled={busy || !primary}
                        />
                        {schemeActions.length ? (
                          <div className="grid gap-1">
                            {schemeActions.map((entry) => <button key={entry.slot_index} className="border border-slate-700 px-2 py-1 text-[0.65rem] text-slate-300 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">{entry.mode === "swap" ? "Swap with" : "Scheme in"} slot {entry.slot_index + 1}</button>)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!focusedPlayer?.hand?.length ? <p className="border border-dashed border-slate-800 p-5 text-sm text-slate-600">Hand is empty.</p> : null}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Scheme Slots</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(focusedPlayer?.scheme_slots || [null, null]).map((itemId, index) => {
                    const plottingAction = actions.find((entry) => entry.type === "commit_card" && entry.source === "scheme" && entry.index === index && entry.player_id === focusedPlayer.id);
                    return itemId ? (
                      <ItemVisual key={`${itemId}-${index}`} item={itemLookup[normalize(itemId)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} actionLabel={plottingAction ? plottingAction.face_up ? "Commit face up" : "Commit anonymously" : ""} onAction={() => performAction(plottingAction)} disabled={busy || !plottingAction} />
                    ) : <div key={index} className="flex aspect-[5/7] items-center justify-center border border-dashed border-slate-700 text-xs text-slate-600">Empty slot {index + 1}</div>;
                  })}
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
};

export default GameRoomPage;
