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
  if (item.kind === "events" || item.kind === "agendas") {
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
          size="hand"
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
      setFocusedPlayerId(statePayload.human_player_id || statePayload.active_player_id || statePayload.players?.[0]?.id || "");
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
  const phase = gameState?.phase || "suspicion";
  const isBotMode = gameState?.mode === "solo_bots";
  const focusedPrivateBot = isBotMode && focusedPlayer?.controller === "bot" && !focusedPlayer?.hand_revealed;

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
      setFocusedPlayerId((current) => (
        nextState.mode === "solo_bots"
          ? nextState.human_player_id
          : ["plotting", "agenda_selection"].includes(nextState.phase) && nextState.players?.some((player) => player.id === current)
            ? current
            : nextState.active_player_id || nextState.players?.[0]?.id || ""
      ));
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
  const storageAction = actions.find((entry) => entry.type === "store_resources");
  const resourcePool = gameState.global_resource_pool || {};
  const selectedStorageTotal = Object.values(storageSelection).reduce((total, amount) => total + Number(amount || 0), 0);
  const boardWidth = Math.max(760, (gameState.cities?.length || 1) * 610);

  const renderPhaseControls = () => {
    const unrestScopeChoices = actions.filter((entry) => entry.type === "choose_event_unrest_scope");
    if (unrestScopeChoices.length) {
      return (
        <div>
          <p className="mb-2 text-sm font-semibold text-amber-100">Minister of State: choose where to place Unrest</p>
          <div className="flex flex-wrap gap-2">
            {unrestScopeChoices.map((entry) => (
              <button
                key={entry.scope}
                className="rounded-md border border-amber-800 bg-stone-950 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50"
                disabled={busy}
                onClick={() => performAction(entry)}
                type="button"
              >
                {entry.scope === "global" ? "Global Unrest" : "City Unrest"}
              </button>
            ))}
          </div>
        </div>
      );
    }
    const destructionChoices = actions.filter((entry) => entry.type === "choose_event_destroy_building");
    if (destructionChoices.length) {
      return (
        <div>
          <p className="mb-2 text-sm font-semibold text-amber-100">Minister of War: choose a Structure to destroy</p>
          <div className="flex flex-wrap gap-2">
            {destructionChoices.map((entry) => {
              const city = gameState.cities.find((candidate) => candidate.id === entry.city_id);
              const card = itemLookup[normalize(entry.card_id)];
              return (
                <button
                  key={`${entry.city_id}-${entry.card_id}`}
                  className="rounded-md border border-rose-900 bg-stone-950 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-950/50 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => performAction(entry)}
                  type="button"
                >
                  {card?.name || entry.card_id} · {city?.name || entry.city_id}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    const tokenCityChoices = actions.filter((entry) => entry.type === "choose_event_token_city");
    if (tokenCityChoices.length) {
      return (
        <div>
          <p className="mb-2 text-sm font-semibold text-amber-100">
            Choose one City for all token changes
          </p>
          <div className="flex flex-wrap gap-2">
            {tokenCityChoices.map((entry) => {
              const city = gameState.cities.find((candidate) => candidate.id === entry.city_id);
              return (
                <button
                  key={entry.city_id}
                  className="rounded-md border border-amber-800 bg-stone-950 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/50 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => performAction(entry)}
                  type="button"
                >
                  {city?.name || entry.city_id}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    const conversionChoices = actions.filter((entry) => entry.type === "choose_event_conversion_resource");
    if (conversionChoices.length) {
      const stage = conversionChoices[0].stage;
      return (
        <div>
          <p className="mb-2 text-sm font-semibold text-amber-100">
            {stage === "amount"
              ? "Minister of Health & Harvest: choose how many resources to convert"
              : `Choose the ${stage === "source" ? "resource to convert" : "destination resource"}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {conversionChoices.map((entry) => (
              <button
                key={stage === "amount" ? entry.amount : entry.resource_id}
                className="rounded-md border border-amber-800 bg-stone-950 p-2 hover:bg-amber-950/50 disabled:opacity-50"
                disabled={busy}
                onClick={() => performAction(entry)}
                title={stage === "amount" ? `Convert ${entry.amount}` : tagLookup[normalize(entry.resource_id)]?.name || entry.resource_id}
                type="button"
              >
                {stage === "amount"
                  ? <span className="px-2 text-sm font-bold text-amber-100">{entry.amount}</span>
                  : <TagIcon tag={tagLookup[normalize(entry.resource_id)]} label={entry.resource_id} size="sm" />}
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
    if (phase === "reveal" && actions.some((entry) => entry.city_id)) {
      return (
        <div className="flex flex-wrap gap-2">
          {actions.map((entry) => {
            const city = gameState.cities.find((item) => item.id === entry.city_id);
            return <button key={entry.city_id} className="rounded-md bg-teal-400 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-teal-300 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">{entry.city_id === "__new_city__" ? "Found new city" : `Build in ${city?.name || entry.city_id}`}</button>;
          })}
        </div>
      );
    }
    if (phase === "condition") {
      return <button className="rounded-md bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50" disabled={busy} onClick={() => perform("continue_phase")} type="button">Resolve Conditions</button>;
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
    if (phase === "hand_refill") {
      const drawAction = actions.find((entry) => entry.type === "refill_hand");
      return drawAction ? (
        <button className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => performAction(drawAction)} type="button">
          Draw {drawAction.draw_amount}
        </button>
      ) : null;
    }
    if (["crisis_intake", "hand_reset", "cleanup"].includes(phase)) {
      return <button className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => perform("continue_phase")} type="button">Resolve phase</button>;
    }
    return null;
  };

  return (
    <main className="imperial-theme min-h-screen bg-slate-950 text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900/75 p-3 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
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
              const awaitingPlot = phase === "plotting" && !player.committed;
              const choosingAgenda = phase === "agenda_selection" && !(player.agenda_selected ?? Boolean(player.hidden_agenda_id));
              const ministries = ministryNamesFor(player.id);
              const inspectable = !isBotMode || player.controller !== "bot" || player.hand_revealed || gameState.agendas_revealed;
              return (
                <button key={player.id} className={`w-full border p-3 text-left ${focused ? "border-amber-500 bg-amber-950/25" : "border-slate-800 bg-slate-950 hover:border-slate-600"} disabled:cursor-default`} disabled={!inspectable} onClick={() => setFocusedPlayerId(player.id)} type="button">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{player.name}</span>
                    {player.controller === "bot" ? <span className="border border-slate-700 px-1.5 py-0.5 text-[0.6rem] font-bold text-slate-400">BOT</span> : null}
                    {active ? <span className="bg-amber-300 px-1.5 py-0.5 text-[0.6rem] font-bold text-stone-950">DECIDING</span> : null}
                    {awaitingPlot ? <span className="bg-teal-300 px-1.5 py-0.5 text-[0.6rem] font-bold text-stone-950">PLOTTING</span> : null}
                    {choosingAgenda ? <span className="bg-sky-300 px-1.5 py-0.5 text-[0.6rem] font-bold text-stone-950">AGENDA</span> : null}
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">Hand {player.hand_count ?? player.hand?.length ?? 0} · Suspicion {player.suspicion || 0}</span>
                  <span className="mt-1 block text-[0.65rem] leading-4 text-amber-700">{ministries.join(" · ") || "No ministry"}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:overflow-hidden">
          {error ? <p className="m-4 border border-rose-900 bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

          <header className="m-3 shrink-0 border border-amber-900/60 bg-stone-950/80 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-amber-700">Current Phase</p>
                <h2 className="mt-0.5 text-lg font-bold text-amber-50">{titleCase(phase)}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {phase === "agenda_selection"
                    ? `${players.filter((player) => !(player.agenda_selected ?? Boolean(player.hidden_agenda_id))).length} players choosing Agendas`
                    : phase === "plotting"
                    ? `${players.filter((player) => !player.committed).length} players still plotting`
                    : activePlayer
                    ? `${activePlayer.name} is deciding`
                    : gameState.winner_player_ids?.length
                      ? `Winners: ${gameState.winner_player_ids.map((playerId) => players.find((player) => player.id === playerId)?.name || playerId).join(", ")}`
                      : "The Empire has fallen"}
                </p>
              </div>
              <div className="max-w-3xl">{renderPhaseControls()}</div>
            </div>
          </header>

          <div className="grid gap-3 px-3 pb-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_17rem] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 lg:min-h-0">
              <section className="border border-slate-800 bg-slate-900 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
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
                <div className="h-[30rem] overflow-auto bg-stone-950/60 p-5 lg:h-auto lg:min-h-0 lg:flex-1">
                  <div className="relative" style={{ width: boardWidth * boardZoom, height: 760 * boardZoom }}>
                    <div className="absolute left-0 top-0 flex origin-top-left gap-8" style={{ width: boardWidth, height: 760, transform: `scale(${boardZoom})` }}>
                      {(gameState.cities || []).map((city) => <CityZone key={city.id} city={city} cardLookup={cardLookup} tagLookup={tagLookup} pillarLookup={pillarLookup} tokenLookup={tokenLookup} storageIconSrc={storageIconSrc} />)}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <section className="border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-center gap-2 text-slate-400"><Crown className="h-4 w-4 text-amber-400" /><h2 className="text-xs font-bold uppercase">Imperial Status</h2></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(gameState.pillars || {}).map(([pillarId, value]) => (
                    <span key={pillarId} className="border border-amber-900/60 bg-stone-950 px-2 py-1 text-xs text-amber-100" title={pillarLookup[normalize(pillarId)]?.name || pillarId}>{pillarLookup[normalize(pillarId)]?.name || titleCase(pillarId)} <strong>{value}</strong></span>
                  ))}
                </div>
                <div className="mt-3 border-t border-slate-800 pt-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase text-slate-500"><Archive className="h-3.5 w-3.5 text-teal-400" />Resources</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(resourcePool).map(([tagId, amount]) => <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={amount} size="sm" />)}
                    {!Object.keys(resourcePool).length ? <span className="text-xs text-slate-600">Empty</span> : null}
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-800 pt-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase text-slate-500"><Users className="h-3.5 w-3.5 text-rose-400" />Empire Tags</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(gameState.empire_tags || {}).map(([tagId, amount]) => <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={amount} size="sm" />)}
                    {!Object.keys(gameState.empire_tags || {}).length ? <span className="text-xs text-slate-600">None</span> : null}
                  </div>
                </div>
              </section>
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
                <h2 className="text-sm font-bold text-white">Face-up Discards</h2>
                <div className="mt-3 space-y-4">
                  <div>
                    <p className="mb-2 text-[0.65rem] font-bold uppercase text-slate-500">Empire</p>
                    <div className="flex flex-wrap gap-2">
                      {(gameState.empire_discard || []).map((itemId, index) => (
                        <ItemVisual key={`${itemId}-${index}`} item={itemLookup[normalize(itemId)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                      ))}
                      {!gameState.empire_discard?.length ? <p className="text-xs text-slate-600">Empty.</p> : null}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[0.65rem] font-bold uppercase text-slate-500">Crisis</p>
                    <div className="flex flex-wrap gap-2">
                      {(gameState.crisis_discard || []).map((itemId, index) => (
                        <ItemVisual key={`${itemId}-${index}`} item={itemLookup[normalize(itemId)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                      ))}
                      {!gameState.crisis_discard?.length ? <p className="text-xs text-slate-600">Empty.</p> : null}
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          <section className="shrink-0 border-t border-slate-800 bg-slate-900 p-3 lg:max-h-[20rem] lg:overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{focusedPlayer?.name || "Player"}</h2>
                <p className="text-xs text-slate-500">{ministryNamesFor(focusedPlayer?.id).join(" · ") || "No ministry"} · Suspicion {focusedPlayer?.suspicion || 0}</p>
                {focusedPlayer?.hand_revealed ? (
                  <p className="mt-1 text-xs font-semibold text-rose-300">Hand and Schemes revealed by Suspicion</p>
                ) : null}
                {focusedPlayer?.hidden_agenda_id ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Hidden Agenda: {agendaLookup[normalize(focusedPlayer.hidden_agenda_id)]?.name || focusedPlayer.hidden_agenda_id}
                    {gameState.agendas_revealed
                      ? ` · ${gameState.agenda_results?.[focusedPlayer.id]?.score || 0} points${gameState.winner_player_ids?.includes(focusedPlayer.id) ? " · Winner" : ""}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">Refill 3 · State refill 4 · Scheme slots 2</p>
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0">
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{phase === "agenda_selection" ? "Choose Hidden Agenda" : "Hand"}</h3>
                <div className="flex flex-nowrap gap-2 overflow-x-auto pb-2">
                  {phase === "agenda_selection" ? (
                    actions
                      .filter((entry) => entry.type === "choose_agenda" && entry.player_id === focusedPlayer?.id)
                      .map((entry) => (
                        <ItemVisual
                          key={entry.agenda_id}
                          item={agendaLookup[normalize(entry.agenda_id)]}
                          catalogs={catalogs}
                          tagLookup={tagLookup}
                          storageIconSrc={storageIconSrc}
                          actionLabel="Keep this Agenda"
                          onAction={() => performAction(entry)}
                          disabled={busy}
                        />
                      ))
                  ) : (focusedPlayer?.hand || []).map((itemId, index) => {
                    const plottingAction = actions.find((entry) => entry.type === "commit_card" && entry.source === "hand" && entry.index === index && entry.player_id === focusedPlayer.id);
                    const schemeActions = actions.filter((entry) => entry.type === "plotting_scheme" && entry.hand_index === index && entry.player_id === focusedPlayer.id);
                    return (
                      <div key={`${itemId}-${index}`} className="space-y-2">
                        <ItemVisual
                          item={itemLookup[normalize(itemId)]}
                          catalogs={catalogs}
                          tagLookup={tagLookup}
                          storageIconSrc={storageIconSrc}
                          actionLabel={plottingAction ? (plottingAction.face_up ? "Commit face up" : "Commit anonymously") : ""}
                          onAction={() => performAction(plottingAction)}
                          disabled={busy || !plottingAction}
                        />
                        {schemeActions.length ? (
                          <div className="grid grid-cols-2 gap-1">
                            {schemeActions.map((entry) => (
                              <button key={`${entry.mode}-${entry.slot_index}`} className="border border-slate-700 px-2 py-1 text-[0.65rem] text-slate-300 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => performAction(entry)} type="button">
                                {entry.mode === "swap" ? "Swap with" : "Scheme in"} slot {entry.slot_index + 1}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {phase === "agenda_selection" && focusedPlayer?.hidden_agenda_id ? (
                    <p className="border border-emerald-900 bg-emerald-950/30 p-5 text-sm text-emerald-200">Agenda selected.</p>
                  ) : null}
                  {focusedPrivateBot ? (
                    <p className="border border-dashed border-slate-800 p-5 text-sm text-slate-500">This bot's hand and Scheme cards are private.</p>
                  ) : null}
                  {phase !== "agenda_selection" && !focusedPlayer?.hand?.length && !focusedPrivateBot ? <p className="border border-dashed border-slate-800 p-5 text-sm text-slate-600">Hand is empty.</p> : null}
                </div>
              </div>
              {phase !== "agenda_selection" && !focusedPrivateBot ? <div>
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Scheme Slots</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(focusedPlayer?.scheme_slots || [null, null]).map((itemId, index) => {
                    const plottingAction = actions.find((entry) => entry.type === "commit_card" && entry.source === "scheme" && entry.index === index && entry.player_id === focusedPlayer.id);
                    const returnAction = actions.find((entry) => entry.type === "plotting_scheme" && entry.mode === "to_hand" && entry.slot_index === index && entry.player_id === focusedPlayer.id);
                    return itemId ? (
                      <div key={`${itemId}-${index}`} className="space-y-2">
                        <ItemVisual item={itemLookup[normalize(itemId)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} actionLabel={plottingAction ? plottingAction.face_up ? "Commit face up" : "Commit anonymously" : ""} onAction={() => performAction(plottingAction)} disabled={busy || !plottingAction} />
                        {returnAction ? <button className="w-full border border-slate-700 px-2 py-1 text-[0.65rem] text-slate-300 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => performAction(returnAction)} type="button">Return to hand</button> : null}
                      </div>
                    ) : <div key={index} className="flex aspect-[5/7] items-center justify-center border border-dashed border-slate-700 text-xs text-slate-600">Empty slot {index + 1}</div>;
                  })}
                </div>
              </div> : null}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
};

export default GameRoomPage;
