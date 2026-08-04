import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Castle,
  Check,
  CircleCheck,
  CircleX,
  Crown,
  Hand,
  ListOrdered,
  LogOut,
  Minus,
  Plus,
  ScrollText,
  Shield,
  Trash2,
  Trophy,
  Users,
  X,
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
  const [agendaOverlayPlayerId, setAgendaOverlayPlayerId] = useState("");
  const [ministryOverlayId, setMinistryOverlayId] = useState("");
  const [selectedHandCardIndex, setSelectedHandCardIndex] = useState(null);
  const [selectedHandCardAnchor, setSelectedHandCardAnchor] = useState(null);
  const [selectedSchemeSlotIndex, setSelectedSchemeSlotIndex] = useState(null);
  const [selectedSchemeCardAnchor, setSelectedSchemeCardAnchor] = useState(null);
  const [schemeSourceIndex, setSchemeSourceIndex] = useState(null);
  const [cityChartersOpen, setCityChartersOpen] = useState(false);
  const [docketOpen, setDocketOpen] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [empireFallOpen, setEmpireFallOpen] = useState(false);
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

  useEffect(() => {
    setSelectedHandCardIndex(null);
    setSelectedHandCardAnchor(null);
    setSelectedSchemeSlotIndex(null);
    setSelectedSchemeCardAnchor(null);
    setSchemeSourceIndex(null);
  }, [focusedPlayerId, gameState?.phase]);

  useEffect(() => {
    if (gameState?.phase === "docket_ordering") setDocketOpen(true);
  }, [gameState?.phase]);

  useEffect(() => {
    setCityChartersOpen(gameState?.phase === "council_vote");
  }, [gameState?.phase]);

  useEffect(() => {
    if (gameState?.phase === "reveal" && gameState?.docket_resolution?.length) {
      setDocketOpen(false);
      setResolutionOpen(true);
    }
  }, [gameState?.phase]);

  useEffect(() => {
    if (gameState?.phase === "game_over") setEmpireFallOpen(true);
  }, [gameState?.phase]);

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
  const phase = gameState?.phase || "council_vote";
  const isBotMode = gameState?.mode === "solo_bots";
  const focusedPrivateBot = isBotMode && focusedPlayer?.controller === "bot" && !focusedPlayer?.hand_revealed;
  const agendaSelectionActions = phase === "agenda_selection"
    ? actions.filter((entry) => entry.type === "choose_agenda" && entry.player_id === focusedPlayer?.id)
    : [];
  const agendaOverlayPlayer = players.find((player) => player.id === agendaOverlayPlayerId);
  const agendaOverlayEntry = agendaOverlayPlayer?.hidden_agenda_id
    ? agendaLookup[normalize(agendaOverlayPlayer.hidden_agenda_id)]
    : null;
  const focusedMinistries = Object.entries(gameState?.ministry_assignments || {})
    .filter(([, playerId]) => playerId === focusedPlayer?.id)
    .map(([ministryId]) => ministryLookup[normalize(ministryId)])
    .filter(Boolean);
  const ministryOverlayEntry = ministryLookup[normalize(ministryOverlayId)];
  const confirmPlottingAction = actions.find(
    (entry) => entry.type === "confirm_plotting" && entry.player_id === focusedPlayer?.id
  );
  const discardCount = (gameState?.foundation_discard?.length || 0) + (gameState?.crisis_discard?.length || 0);

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

  useEffect(() => {
    const possibleActions = gameState?.possible_actions || [];
    const automaticReveal = possibleActions.length === 1 && possibleActions[0].type === "reveal_next";
    if (!resolutionOpen || gameState?.phase !== "reveal" || !automaticReveal || busy) return undefined;
    const timer = window.setTimeout(() => {
      void performAction(possibleActions[0]);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [busy, gameState, resolutionOpen]);

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

  const currentReveal = gameState.current_reveal;
  const resolutionDecisionAction = phase === "reveal"
    ? actions.find((entry) => entry.type !== "reveal_next")
    : null;
  const automaticRevealPending = phase === "reveal"
    && actions.length === 1
    && actions[0].type === "reveal_next";
  const resolutionDecisionMessage = (() => {
    if (!resolutionDecisionAction) return "";
    const decisionPlayer = players.find((player) => player.id === resolutionDecisionAction.player_id);
    const ministries = Object.entries(gameState.ministry_assignments || {})
      .filter(([, holder]) => holder === resolutionDecisionAction.player_id)
      .map(([ministryId]) => ministryLookup[normalize(ministryId)]?.name || ministryId);
    const actor = ministries.length
      ? `${ministries.join(" and ")} (${decisionPlayer?.name || resolutionDecisionAction.player_id})`
      : decisionPlayer?.name || "The responsible player";
    const choice = {
      choose_event_unrest_scope: "choose whether Unrest is placed globally or in a City",
      choose_event_destroy_building: "choose which eligible Structure is destroyed",
      choose_event_token_city: "choose the City receiving the token effects",
      choose_event_conversion_resource: "choose how the resource conversion is resolved",
      choose_event_resource: "choose the affected resource",
      place_revealed_card: "choose where the completed Structure is built",
    }[resolutionDecisionAction.type] || "make the required resolution choice";
    return `${actor} must ${choice}.`;
  })();
  const storageAction = actions.find((entry) => entry.type === "store_resources");
  const resourcePool = gameState.global_resource_pool || {};
  const selectedStorageTotal = Object.values(storageSelection).reduce((total, amount) => total + Number(amount || 0), 0);
  const boardWidth = Math.max(760, (gameState.cities?.length || 1) * 610);

  const renderPhaseControls = () => {
    if (phase === "game_over") {
      return (
        <button
          className="inline-flex items-center gap-2 border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm font-bold text-amber-100 hover:bg-amber-900/50"
          onClick={() => setEmpireFallOpen(true)}
          type="button"
        >
          <Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" />
          View final results
        </button>
      );
    }
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
    if (phase === "council_vote") {
      return (
        <button
          className="inline-flex items-center gap-2 border border-amber-900/70 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-950/50"
          onClick={() => setCityChartersOpen(true)}
          type="button"
        >
          <Castle className="h-4 w-4" aria-hidden="true" />
          Open Council Vote
        </button>
      );
    }
    if (phase === "docket_ordering") {
      return (
        <button
          className="inline-flex items-center gap-2 border border-amber-900/70 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-950/50"
          onClick={() => setDocketOpen(true)}
          type="button"
        >
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
          Open Council Docket
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
      <div className="grid min-h-screen grid-cols-1 lg:h-screen lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-800 bg-slate-900/75 p-2 lg:h-[60vh] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-amber-700">Anonymous Council</p>
              <h1 className="mt-1 text-base font-bold text-amber-50">Era {gameState.era}</h1>
              <p className="mt-1 text-xs text-slate-500">{titleCase(phase)}</p>
            </div>
            <button className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50" disabled={ending} onClick={endGame} title="End game" type="button"><LogOut className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 space-y-1.5">
            {players.map((player) => {
              const focused = player.id === focusedPlayer?.id;
              const active = player.id === activePlayer?.id;
              const awaitingPlot = phase === "plotting" && !player.committed;
              const choosingAgenda = phase === "agenda_selection" && !(player.agenda_selected ?? Boolean(player.hidden_agenda_id));
              const ministries = Object.entries(gameState.ministry_assignments || {})
                .filter(([, holder]) => holder === player.id)
                .map(([ministryId]) => ministryLookup[normalize(ministryId)])
                .filter(Boolean);
              const inspectable = !isBotMode || player.controller !== "bot" || player.hand_revealed || gameState.agendas_revealed;
              return (
                <button key={player.id} className={`w-full border px-2 py-1.5 text-left ${focused ? "border-amber-500 bg-amber-950/25" : "border-slate-800 bg-slate-950 hover:border-slate-600"} disabled:cursor-default`} disabled={!inspectable} onClick={() => setFocusedPlayerId(player.id)} type="button">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white" title={player.name}>{player.name}</span>
                    {player.controller === "bot" ? <span className="text-[0.55rem] font-bold text-slate-500">BOT</span> : null}
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.65rem] text-slate-400" title={`${player.hand_count ?? player.hand?.length ?? 0} cards in hand`}>
                      <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                      {player.hand_count ?? player.hand?.length ?? 0}
                    </span>
                  </span>
                  <span className="mt-1 flex min-h-6 items-center gap-1">
                    {ministries.map((ministry) => {
                      const iconSrc = buildAssetUrl(
                        ministry.data?.icon
                        || imageLookup[normalize(ministry.data?.icon_image_id)]?.data?.src
                        || ""
                      );
                      return iconSrc ? (
                        <img key={ministry.id} alt="" className="h-5 w-5 object-contain" src={iconSrc} title={ministry.name} />
                      ) : (
                        <Crown key={ministry.id} className="h-4 w-4 text-amber-500" aria-label={ministry.name} />
                      );
                    })}
                    {!ministries.length ? <span className="text-[0.6rem] text-slate-600">No ministry</span> : null}
                    <span className="ml-auto flex items-center gap-1">
                      {active ? <span className="h-2 w-2 bg-amber-300" title="Deciding" /> : null}
                      {awaitingPlot ? <span className="h-2 w-2 bg-teal-300" title="Plotting" /> : null}
                      {choosingAgenda ? <span className="h-2 w-2 bg-sky-300" title="Choosing Agenda" /> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="relative min-w-0 lg:grid lg:h-screen lg:min-h-0 lg:grid-rows-[15vh_45vh_40vh] lg:overflow-visible">
          {error ? <p className="absolute left-4 right-4 top-2 z-40 border border-rose-900 bg-rose-950/95 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

          <header className="m-2 shrink-0 border border-amber-900/60 bg-stone-950/80 px-3 py-1.5">
            <div className="flex min-h-9 items-center justify-between gap-4">
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="shrink-0 text-xs font-bold uppercase text-amber-700">Era {gameState.era}</span>
                <h2 className="shrink-0 text-sm font-bold text-amber-50">{titleCase(phase)}</h2>
                <p className="truncate text-xs text-slate-500">
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
              <div className="shrink-0">{renderPhaseControls()}</div>
            </div>
          </header>

          <div className="grid h-[45vh] gap-3 px-3 pb-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_17rem] lg:overflow-visible xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0 lg:min-h-0">
              <section className="relative border border-slate-800 bg-slate-900 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
                <div className="absolute right-3 top-3 z-30 flex items-center gap-2 border border-slate-700 bg-slate-950/95 p-1 shadow-lg">
                  <button className="h-8 w-8 border border-slate-700 hover:bg-slate-800" onClick={() => setBoardZoom((value) => Math.max(0.55, value - 0.1))} title="Zoom out" type="button"><Minus className="mx-auto h-4 w-4" /></button>
                  <span className="w-11 text-center text-xs text-slate-400">{Math.round(boardZoom * 100)}%</span>
                  <button className="h-8 w-8 border border-slate-700 hover:bg-slate-800" onClick={() => setBoardZoom((value) => Math.min(1.2, value + 0.1))} title="Zoom in" type="button"><Plus className="mx-auto h-4 w-4" /></button>
                </div>
                <div className="h-full overflow-y-scroll bg-stone-950/60 p-5 lg:min-h-0 lg:flex-1">
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
                  {Object.entries(gameState.pillars || {}).map(([pillarId, value]) => {
                    const pillar = pillarLookup[normalize(pillarId)];
                    const iconSrc = buildAssetUrl(
                      pillar?.data?.icon
                      || imageLookup[normalize(pillar?.data?.icon_image_id)]?.data?.src
                      || ""
                    );
                    const label = pillar?.name || titleCase(pillarId);
                    return (
                      <span
                        key={pillarId}
                        className="group relative inline-flex h-10 w-10 items-center justify-center bg-stone-950"
                        title={`${label}: ${value}`}
                      >
                        {iconSrc ? (
                          <img alt="" className="h-9 w-9 object-contain" src={iconSrc} />
                        ) : (
                          <Shield className="h-7 w-7 text-amber-500" aria-hidden="true" />
                        )}
                        <strong className="absolute -right-1 -top-1 min-w-4 border border-amber-800 bg-amber-950 px-0.5 text-center text-[0.6rem] leading-4 text-amber-50">
                          {value}
                        </strong>
                        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden -translate-x-1/2 whitespace-nowrap border border-amber-900/70 bg-stone-950 px-2 py-1 text-[0.65rem] font-semibold text-amber-100 shadow-xl group-hover:block">
                          {label}
                        </span>
                      </span>
                    );
                  })}
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
              <button
                className="flex w-full items-center justify-between gap-3 border border-slate-800 bg-slate-900 p-3 text-left hover:border-amber-900/70 hover:bg-amber-950/20"
                onClick={() => setCityChartersOpen(true)}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Castle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  City Charters
                </span>
                <span className="border border-slate-700 px-2 py-1 text-xs text-slate-400">
                  {gameState.available_city_card_ids?.length || 0}
                </span>
              </button>
              <button
                className="flex w-full items-center justify-between gap-3 border border-slate-800 bg-slate-900 p-3 text-left hover:border-amber-900/70 hover:bg-amber-950/20"
                onClick={() => {
                  if (gameState.docket_resolution?.length && phase !== "docket_ordering") {
                    setResolutionOpen(true);
                  } else {
                    setDocketOpen(true);
                  }
                }}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <ListOrdered className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  {gameState.docket_resolution?.length && phase !== "docket_ordering"
                    ? "Docket Resolution"
                    : "Council Docket"}
                </span>
                <span className="border border-slate-700 px-2 py-1 text-xs text-slate-400">
                  {gameState.docket_resolution?.length || gameState.council_stack?.length || 0}
                </span>
              </button>
              {currentReveal ? (
                <section className="border border-amber-900/60 bg-stone-950 p-3">
                  <h2 className="mb-2 text-sm font-bold text-amber-100">Current Reveal · {titleCase(currentReveal.status)}</h2>
                  <ItemVisual item={itemLookup[normalize(currentReveal.item_id)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                  {currentReveal.priority_kind === "founding" ? (
                    <p className="mt-2 text-xs text-amber-700">Supported for founding by the Council.</p>
                  ) : currentReveal.face_up ? (
                    <p className="mt-2 text-xs text-amber-700">Committed by {players.find((player) => player.id === currentReveal.owner_player_id)?.name}</p>
                  ) : null}
                </section>
              ) : null}
              <button
                className="flex w-full items-center justify-between gap-3 border border-slate-800 bg-slate-900 p-3 text-left hover:border-amber-900/70 hover:bg-amber-950/20"
                onClick={() => setDiscardOpen(true)}
                type="button"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-white">
                  <Trash2 className="h-4 w-4 text-rose-400" aria-hidden="true" />
                  Face-up Discards
                </span>
                <span className="border border-slate-700 px-2 py-1 text-xs text-slate-400">{discardCount}</span>
              </button>
            </aside>
          </div>

          <section className="min-h-0 border-t border-slate-800 bg-slate-900 p-1 lg:fixed lg:inset-x-0 lg:bottom-0 lg:z-50 lg:h-[40vh] lg:overflow-visible">
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_22.5rem_5.5rem]">
              <div className="min-w-0 overflow-visible">
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">{phase === "agenda_selection" ? "Choose Hidden Agenda" : "Hand"}</h3>
                <div
                  className="flex h-[calc(100%_-_1.5rem)] w-full min-w-0 flex-nowrap items-start gap-2 overflow-x-auto overflow-y-hidden px-1 pb-2"
                  onScroll={() => {
                    setSelectedHandCardIndex(null);
                    setSelectedHandCardAnchor(null);
                    setSchemeSourceIndex(null);
                  }}
                >
                  {phase === "agenda_selection" ? null : (focusedPlayer?.hand || []).map((itemId, index) => {
                    const item = itemLookup[normalize(itemId)];
                    const plottingAction = actions.find((entry) => entry.type === "select_commit_card" && entry.source === "hand" && entry.index === index && entry.player_id === focusedPlayer.id);
                    const schemeActions = actions.filter((entry) => entry.type === "plotting_scheme" && entry.hand_index === index && entry.player_id === focusedPlayer.id);
                    const choosingSchemeSlot = schemeSourceIndex === index;
                    const selected = selectedHandCardIndex === index;
                    const selectable = Boolean(plottingAction || schemeActions.length);
                    const isCrisis = item?.kind === "events" && item?.data?.subtype === "crisis";
                    const preview = plottingAction?.resolution_preview;
                    const previewClass = preview === "unresolved"
                      ? "opacity-50 grayscale"
                      : isCrisis && preview === "success"
                        ? "rounded-lg bg-emerald-950/25 ring-2 ring-emerald-500/80"
                        : isCrisis && preview === "failure"
                          ? "rounded-lg bg-rose-950/30 ring-2 ring-rose-500/80"
                          : "";
                    const selectCard = (event) => {
                      if (!selectable || busy) return;
                      if (selected) {
                        setSelectedHandCardIndex(null);
                        setSelectedHandCardAnchor(null);
                        setSchemeSourceIndex(null);
                      } else {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setSelectedHandCardIndex(index);
                        setSelectedHandCardAnchor({
                          left: bounds.left + bounds.width / 2,
                          top: bounds.top,
                        });
                        setSelectedSchemeSlotIndex(null);
                        setSelectedSchemeCardAnchor(null);
                        if (schemeSourceIndex !== index) setSchemeSourceIndex(null);
                      }
                    };
                    return (
                      <div
                        key={`${itemId}-${index}`}
                        className={`relative shrink-0 ${selectable ? "cursor-pointer" : ""} ${
                          selected || plottingAction?.selected ? "ring-2 ring-amber-400" : ""
                        } ${choosingSchemeSlot ? "ring-2 ring-teal-300" : ""}`}
                        onClick={selectCard}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectCard();
                          }
                        }}
                        role={selectable ? "button" : undefined}
                        tabIndex={selectable ? 0 : undefined}
                      >
                        <div
                          className={`transition-all duration-300 ${previewClass}`}
                          title={preview === "unresolved"
                            ? "This card cannot currently resolve."
                            : isCrisis && preview === "success"
                              ? "This Crisis currently meets its main resolution."
                              : isCrisis && preview === "failure"
                                ? "This Crisis currently triggers its alternative resolution."
                                : undefined}
                        >
                          <ItemVisual
                            item={item}
                            catalogs={catalogs}
                            tagLookup={tagLookup}
                            storageIconSrc={storageIconSrc}
                          />
                        </div>
                        {selected && selectedHandCardAnchor && (plottingAction || schemeActions.length) ? (
                          <div
                            className="fixed z-[1400] flex items-center gap-2 border border-amber-900/70 bg-slate-950 p-1.5 shadow-xl"
                            style={{
                              left: selectedHandCardAnchor.left,
                              top: selectedHandCardAnchor.top,
                              transform: "translate(-50%, calc(-100% - 0.5rem))",
                            }}
                          >
                              {plottingAction ? (
                                <button
                                  className="whitespace-nowrap border border-amber-400 bg-amber-300 px-3 py-1.5 text-xs font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-60"
                                  disabled={busy || plottingAction.selected}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSchemeSourceIndex(null);
                                    void performAction(plottingAction);
                                  }}
                                  title={plottingAction.face_up ? "Commit face up" : "Commit anonymously"}
                                  type="button"
                                >
                                  {plottingAction.selected ? "Committed" : "Commit"}
                                </button>
                              ) : null}
                              {schemeActions.length ? (
                                <button
                                  className="whitespace-nowrap border border-teal-400 bg-teal-950/90 px-3 py-1.5 text-xs font-bold text-teal-100 hover:bg-teal-900"
                                  disabled={busy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSchemeSourceIndex(choosingSchemeSlot ? null : index);
                                  }}
                                  type="button"
                                >
                                  {choosingSchemeSlot ? "Cancel Scheme" : "Scheme"}
                                </button>
                              ) : null}
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
              {phase !== "agenda_selection" && !focusedPrivateBot ? <div className="min-w-0 overflow-visible">
                <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">Scheme Slots</h3>
                <div className="flex items-start gap-2">
                  {(focusedPlayer?.scheme_slots || [null, null]).map((itemId, index) => {
                    const item = itemLookup[normalize(itemId)];
                    const plottingAction = actions.find((entry) => entry.type === "select_commit_card" && entry.source === "scheme" && entry.index === index && entry.player_id === focusedPlayer.id);
                    const returnAction = actions.find((entry) => entry.type === "plotting_scheme" && entry.mode === "to_hand" && entry.slot_index === index && entry.player_id === focusedPlayer.id);
                    const isCrisis = item?.kind === "events" && item?.data?.subtype === "crisis";
                    const preview = plottingAction?.resolution_preview;
                    const previewClass = preview === "unresolved"
                      ? "opacity-50 grayscale"
                      : isCrisis && preview === "success"
                        ? "rounded-lg bg-emerald-950/25 ring-2 ring-emerald-500/80"
                        : isCrisis && preview === "failure"
                          ? "rounded-lg bg-rose-950/30 ring-2 ring-rose-500/80"
                          : "";
                    const placementAction = schemeSourceIndex === null
                      ? null
                      : actions.find(
                        (entry) => entry.type === "plotting_scheme"
                          && entry.player_id === focusedPlayer.id
                          && entry.hand_index === schemeSourceIndex
                          && entry.slot_index === index
                          && ["to_scheme", "swap"].includes(entry.mode)
                      );
                    const choosePlacement = async () => {
                      if (!placementAction) return;
                      const nextState = await performAction(placementAction);
                      if (nextState) {
                        setSelectedHandCardIndex(null);
                        setSelectedHandCardAnchor(null);
                        setSelectedSchemeSlotIndex(null);
                        setSelectedSchemeCardAnchor(null);
                        setSchemeSourceIndex(null);
                      }
                    };
                    const schemeCardSelected = selectedSchemeSlotIndex === index;
                    const schemeCardSelectable = Boolean(plottingAction || returnAction);
                    const selectSchemeCard = (event) => {
                      if (!schemeCardSelectable || placementAction || busy) return;
                      if (schemeCardSelected) {
                        setSelectedSchemeSlotIndex(null);
                        setSelectedSchemeCardAnchor(null);
                      } else {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setSelectedSchemeSlotIndex(index);
                        setSelectedSchemeCardAnchor({
                          left: bounds.left + bounds.width / 2,
                          top: bounds.top,
                        });
                        setSelectedHandCardIndex(null);
                        setSelectedHandCardAnchor(null);
                        setSchemeSourceIndex(null);
                      }
                    };
                    return itemId ? (
                      <div
                        key={`${itemId}-${index}`}
                        className={`relative shrink-0 ${schemeCardSelectable ? "cursor-pointer" : ""} ${
                          schemeCardSelected || plottingAction?.selected ? "ring-2 ring-amber-400" : ""
                        } ${placementAction ? "ring-2 ring-teal-300" : ""}`}
                        onClick={selectSchemeCard}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectSchemeCard(event);
                          }
                        }}
                        role={schemeCardSelectable ? "button" : undefined}
                        tabIndex={schemeCardSelectable ? 0 : undefined}
                      >
                        <div
                          className={`transition-all duration-300 ${previewClass}`}
                          title={preview === "unresolved"
                            ? "This card cannot currently resolve."
                            : isCrisis && preview === "success"
                              ? "This Crisis currently meets its main resolution."
                              : isCrisis && preview === "failure"
                                ? "This Crisis currently triggers its alternative resolution."
                                : undefined}
                        >
                          <ItemVisual item={item} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                        </div>
                        {placementAction ? (
                          <button
                            className="absolute inset-0 z-30 flex items-center justify-center bg-teal-950/75 p-2 text-xs font-bold text-teal-50 hover:bg-teal-900/85 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void choosePlacement()}
                            type="button"
                          >
                            Swap into slot {index + 1}
                          </button>
                        ) : schemeCardSelected && selectedSchemeCardAnchor && (plottingAction || returnAction) ? (
                          <div
                            className="fixed z-[1400] flex items-center gap-2 border border-amber-900/70 bg-slate-950 p-1.5 shadow-xl"
                            style={{
                              left: selectedSchemeCardAnchor.left,
                              top: selectedSchemeCardAnchor.top,
                              transform: "translate(-50%, calc(-100% - 0.5rem))",
                            }}
                          >
                              {plottingAction ? (
                                <button
                                  className="whitespace-nowrap border border-amber-400 bg-amber-300 px-3 py-1.5 text-xs font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-60"
                                  disabled={busy || plottingAction.selected}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void performAction(plottingAction);
                                  }}
                                  type="button"
                                >
                                  {plottingAction.selected ? "Committed" : "Commit"}
                                </button>
                              ) : null}
                              {returnAction ? (
                                <button
                                  className="whitespace-nowrap border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                                  disabled={busy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void performAction(returnAction);
                                  }}
                                  type="button"
                                >
                                  Return to hand
                                </button>
                              ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        key={index}
                        className={`flex aspect-[5/7] w-[clamp(9rem,13vw,11rem)] shrink-0 items-center justify-center border border-dashed text-xs ${
                          placementAction
                            ? "border-teal-300 bg-teal-950/60 font-bold text-teal-100 hover:bg-teal-900/70"
                            : "border-slate-700 text-slate-600"
                        }`}
                        disabled={!placementAction || busy}
                        onClick={() => void choosePlacement()}
                        type="button"
                      >
                        {placementAction ? `Place in slot ${index + 1}` : `Empty slot ${index + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div> : null}
              <aside className="flex min-w-0 flex-col items-center gap-2 border-l border-slate-800 px-1 lg:col-start-3">
                <div className="grid grid-cols-2 gap-2">
                  {focusedMinistries.map((ministry) => {
                    const iconSrc = buildAssetUrl(
                      ministry.data?.icon
                      || imageLookup[normalize(ministry.data?.icon_image_id)]?.data?.src
                      || ""
                    );
                    return (
                      <button
                        key={ministry.id}
                        aria-label={`Open ${ministry.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center border border-amber-900/70 bg-stone-950 text-amber-300 hover:bg-amber-950/60"
                        onClick={() => setMinistryOverlayId(ministry.id)}
                        title={ministry.name}
                        type="button"
                      >
                        {iconSrc ? (
                          <img alt="" className="h-7 w-7 object-contain" src={iconSrc} />
                        ) : (
                          <Crown className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                  <span
                    aria-label={`Suspicion ${focusedPlayer?.suspicion || 0}`}
                    className="relative inline-flex h-9 w-9 items-center justify-center border border-rose-900/70 bg-stone-950 text-rose-300"
                    title={`Suspicion ${focusedPlayer?.suspicion || 0}`}
                  >
                    <Shield className="h-5 w-5" aria-hidden="true" />
                    <strong className="absolute -right-1 -top-1 min-w-4 border border-rose-800 bg-rose-950 px-0.5 text-center text-[0.6rem] leading-4 text-rose-100">
                      {focusedPlayer?.suspicion || 0}
                    </strong>
                  </span>
                  {focusedPlayer?.hidden_agenda_id ? (
                    <button
                      aria-label="Open secret Agenda"
                      className="relative inline-flex h-9 w-9 items-center justify-center border border-amber-900/70 bg-stone-950 text-amber-300 hover:bg-amber-950/60"
                      onClick={() => setAgendaOverlayPlayerId(focusedPlayer.id)}
                      title={`Agenda: ${agendaLookup[normalize(focusedPlayer.hidden_agenda_id)]?.name || focusedPlayer.hidden_agenda_id}`}
                      type="button"
                    >
                      <ScrollText className="h-5 w-5" aria-hidden="true" />
                      {gameState.agendas_revealed ? (
                        <strong className="absolute -right-1 -top-1 min-w-4 border border-amber-800 bg-amber-950 px-0.5 text-center text-[0.6rem] leading-4 text-amber-100">
                          {gameState.agenda_results?.[focusedPlayer.id]?.score || 0}
                        </strong>
                      ) : null}
                    </button>
                  ) : null}
                </div>
                {phase === "plotting" && confirmPlottingAction ? (
                  <button
                    aria-label={confirmPlottingAction.has_selection ? "Confirm submitted card" : "Confirm no card"}
                    className="inline-flex h-9 w-full items-center justify-center gap-1 bg-amber-300 px-1 text-stone-950 hover:bg-amber-200 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => performAction(confirmPlottingAction)}
                    title={confirmPlottingAction.has_selection ? "Confirm submitted card" : "Confirm no card"}
                    type="button"
                  >
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="text-[0.6rem] font-bold uppercase">
                      {confirmPlottingAction.has_selection ? "Confirm" : "No card"}
                    </span>
                  </button>
                ) : null}
              </aside>
            </div>
          </section>
        </section>
      </div>

      {agendaSelectionActions.length ? (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-6">
          <section className="w-full max-w-6xl border border-amber-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 text-center">
              <p className="text-xs font-bold uppercase text-amber-600">Secret Selection</p>
              <h2 className="mt-1 text-lg font-bold text-amber-50">Choose an Agenda for {focusedPlayer?.name}</h2>
            </div>
            <div className="flex flex-wrap items-start justify-center gap-5">
              {agendaSelectionActions.map((entry) => (
                <div key={entry.agenda_id} className="w-full max-w-[30rem] space-y-3">
                  <CatalogItemVisual
                    entry={agendaLookup[normalize(entry.agenda_id)]}
                    tags={catalogs.tags}
                    cards={catalogs.cards}
                    ministries={catalogs.ministries}
                    images={catalogs.images}
                    pillars={catalogs.pillars}
                    tokens={catalogs.tokens}
                    effectIcons={catalogs.effect_icons}
                  />
                  <button
                    className="w-full bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => performAction(entry)}
                    type="button"
                  >
                    Keep this Agenda
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {cityChartersOpen ? (
        <div
          className="fixed inset-0 z-[1240] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCityChartersOpen(false);
          }}
        >
          <section className="w-full max-w-6xl border border-amber-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-amber-600">Public Charters</p>
                <h2 className="mt-1 text-lg font-bold text-amber-50">
                  {phase === "council_vote" ? "Council Vote" : "Available Cities"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {phase === "council_vote"
                    ? `${activePlayer?.name || "The active player"} supports a City or places Suspicion. Two votes queue a City first in the Docket.`
                    : "These City cards remain available for a future Council vote."}
                </p>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setCityChartersOpen(false)}
                title="Close City Charters"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {phase === "council_vote" ? (
              <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                {actions
                  .filter((entry) => entry.type === "cast_council_vote" && entry.target_type === "player")
                  .map((entry) => {
                    const target = players.find((player) => player.id === entry.target_id);
                    return (
                      <button
                        key={entry.target_id}
                        className="border border-rose-900 px-3 py-2 text-sm text-rose-100 hover:bg-rose-950/50 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => performAction(entry)}
                        type="button"
                      >
                        Suspect {target?.name || entry.target_id}
                      </button>
                    );
                  })}
                {actions
                  .filter((entry) => entry.type === "cast_council_vote" && entry.target_type === "abstain")
                  .map((entry) => (
                    <button
                      key="abstain"
                      className="border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => performAction(entry)}
                      type="button"
                    >
                      Continue
                    </button>
                  ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-center gap-5">
              {(gameState.available_city_card_ids || []).map((cityCardId) => {
                const voteAction = actions.find(
                  (entry) => entry.type === "cast_council_vote"
                    && entry.target_type === "city"
                    && entry.target_id === cityCardId
                );
                const votes = Number(gameState.city_vote_counts?.[cityCardId] || 0);
                return (
                  <div key={cityCardId} className="space-y-2">
                    <ItemVisual
                      item={cardLookup[normalize(cityCardId)]}
                      catalogs={catalogs}
                      tagLookup={tagLookup}
                      storageIconSrc={storageIconSrc}
                    />
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span>{votes} / 2 support</span>
                      {voteAction ? (
                        <span className={voteAction.buildable ? "text-emerald-300" : "text-rose-300"}>
                          {voteAction.buildable ? "Buildable" : "Not buildable"}
                        </span>
                      ) : null}
                    </div>
                    {voteAction ? (
                      <button
                        className="w-full bg-amber-300 px-3 py-2 text-xs font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => performAction(voteAction)}
                        type="button"
                      >
                        Support this City
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {!gameState.available_city_card_ids?.length ? (
                <p className="py-10 text-sm text-slate-500">No City charters remain.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {docketOpen ? (
        <div
          className="fixed inset-0 z-[1250] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDocketOpen(false);
          }}
        >
          <section className="w-full max-w-7xl border border-amber-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-amber-600">Resolution Queue</p>
                <h2 className="mt-1 text-lg font-bold text-amber-50">Council Docket</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {phase === "docket_ordering"
                    ? "The Minister of the Empire decides the resolution order."
                    : `${gameState.council_stack?.length || 0} cards remain`}
                </p>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setDocketOpen(false)}
                title="Close Council Docket"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mb-5 flex min-h-11 items-center gap-3 border-y border-slate-800 bg-slate-950/50 px-3 py-2">
              <div className="flex shrink-0 items-center gap-1.5 text-[0.65rem] font-bold uppercase text-slate-500">
                <Archive className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" />
                Available Resources
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(resourcePool).map(([resourceId, amount]) => (
                  <TagIcon
                    key={resourceId}
                    tag={tagLookup[normalize(resourceId)]}
                    label={resourceId}
                    count={amount}
                    size="sm"
                  />
                ))}
                {!Object.keys(resourcePool).length ? <span className="text-xs text-slate-600">Empty</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-start justify-center gap-4">
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
                      {commitment.priority_kind === "founding" ? (
                        <span>City founding</span>
                      ) : commitment.face_up ? (
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
              {!gameState.council_stack?.length ? <p className="py-10 text-sm text-slate-500">No committed cards.</p> : null}
            </div>
            {phase === "docket_ordering" ? (
              <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
                <button
                  className="inline-flex items-center gap-2 bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200 disabled:opacity-50"
                  disabled={busy || !actions.some((entry) => entry.type === "confirm_docket_order")}
                  onClick={async () => {
                    const confirmAction = actions.find((entry) => entry.type === "confirm_docket_order");
                    if (confirmAction) {
                      await performAction(confirmAction);
                      setDocketOpen(false);
                      setResolutionOpen(true);
                    }
                  }}
                  type="button"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Confirm Docket order
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {resolutionOpen && gameState.docket_resolution?.length ? (
        <div
          className="fixed inset-0 z-[1275] flex items-center justify-center bg-slate-950/90 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResolutionOpen(false);
          }}
        >
          <section className="flex max-h-[92vh] w-full max-w-[96rem] flex-col border border-amber-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-amber-600">Ordered Resolution</p>
                <h2 className="mt-1 text-lg font-bold text-amber-50">Council Docket</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {phase === "reveal"
                    ? "Cards resolve from left to right."
                    : "Docket resolution is complete."}
                </p>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setResolutionOpen(false)}
                title="Close Docket Resolution"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden py-3">
              <div className="flex min-w-max items-start gap-4 px-2">
                {gameState.docket_resolution.map((resolution, index) => {
                  const status = resolution.status || "queued";
                  const succeeded = ["built", "succeeded"].includes(status);
                  const failed = status === "failed";
                  const discarded = status === "discarded";
                  const resolving = status === "resolving";
                  const statusLabel = succeeded
                    ? status === "built" ? "Built" : "Succeeded"
                    : failed
                      ? resolution.is_crisis ? "Crisis consequence" : "Alternative effect"
                      : discarded
                        ? "No effect"
                        : resolving
                          ? "Resolving"
                          : "Queued";
                  const toneClass = succeeded
                    ? "border-emerald-400 bg-emerald-950/35 ring-2 ring-emerald-400/70"
                    : failed
                      ? "border-rose-500 bg-rose-950/40 ring-2 ring-rose-500/70"
                      : discarded
                        ? "border-slate-700 bg-slate-950/60 opacity-45 grayscale"
                        : resolving
                          ? "animate-pulse border-amber-300 bg-amber-950/35 ring-2 ring-amber-300/70"
                          : "border-slate-800 bg-slate-950/30 opacity-65";
                  return (
                    <div
                      key={resolution.id}
                      className={`docket-resolution-card relative shrink-0 border p-2 transition-all duration-500 ${toneClass}`}
                      style={{ animationDelay: `${index * 110}ms` }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-[0.65rem] font-bold uppercase">
                        <span className="text-slate-500">{index + 1}</span>
                        <span className={
                          succeeded
                            ? "text-emerald-300"
                            : failed
                              ? "text-rose-300"
                              : discarded
                                ? "text-slate-500"
                                : resolving
                                  ? "text-amber-200"
                                  : "text-slate-600"
                        }>
                          {statusLabel}
                        </span>
                      </div>
                      <ItemVisual
                        item={itemLookup[normalize(resolution.item_id)]}
                        catalogs={catalogs}
                        tagLookup={tagLookup}
                        storageIconSrc={storageIconSrc}
                      />
                      {succeeded ? (
                        <CircleCheck className="absolute right-3 top-8 z-20 h-7 w-7 bg-emerald-950 text-emerald-300" aria-hidden="true" />
                      ) : failed ? (
                        <CircleX className="absolute right-3 top-8 z-20 h-7 w-7 bg-rose-950 text-rose-300" aria-hidden="true" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 min-h-12 border-t border-slate-800 pt-4">
              {resolutionDecisionMessage ? (
                <div className="mb-3 border border-amber-800/80 bg-amber-950/35 px-3 py-2">
                  <p className="text-[0.65rem] font-bold uppercase text-amber-500">Resolution paused for a decision</p>
                  <p className="mt-1 text-sm text-amber-100">{resolutionDecisionMessage}</p>
                </div>
              ) : null}
              <div className="flex items-center justify-end">
                {automaticRevealPending ? (
                  <p className="animate-pulse text-sm font-semibold text-amber-200">Resolving the next Docket card...</p>
                ) : phase === "reveal" ? (
                  renderPhaseControls()
                ) : (
                <button
                  className="bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-200"
                  onClick={() => setResolutionOpen(false)}
                  type="button"
                >
                  Continue
                </button>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {discardOpen ? (
        <div
          className="fixed inset-0 z-[1250] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDiscardOpen(false);
          }}
        >
          <section className="max-h-[90vh] w-full max-w-7xl overflow-y-auto border border-amber-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-amber-600">Public Information</p>
                <h2 className="mt-1 text-lg font-bold text-amber-50">Face-up Discards · {discardCount}</h2>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setDiscardOpen(false)}
                title="Close discards"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-6">
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">Foundation · {gameState.foundation_discard?.length || 0}</h3>
                <div className="flex flex-wrap items-start gap-3">
                  {(gameState.foundation_discard || []).map((itemId, index) => (
                    <ItemVisual key={`${itemId}-${index}`} item={itemLookup[normalize(itemId)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                  ))}
                  {!gameState.foundation_discard?.length ? <p className="text-sm text-slate-600">Empty.</p> : null}
                </div>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">Crisis · {gameState.crisis_discard?.length || 0}</h3>
                <div className="flex flex-wrap items-start gap-3">
                  {(gameState.crisis_discard || []).map((itemId, index) => (
                    <ItemVisual key={`${itemId}-${index}`} item={itemLookup[normalize(itemId)]} catalogs={catalogs} tagLookup={tagLookup} storageIconSrc={storageIconSrc} />
                  ))}
                  {!gameState.crisis_discard?.length ? <p className="text-sm text-slate-600">Empty.</p> : null}
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {agendaOverlayEntry ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAgendaOverlayPlayerId("");
          }}
        >
          <section className="w-full max-w-[32rem] border border-amber-900/70 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase text-amber-100">Secret Agenda</h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setAgendaOverlayPlayerId("")}
                title="Close Agenda"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <CatalogItemVisual
              entry={agendaOverlayEntry}
              tags={catalogs.tags}
              cards={catalogs.cards}
              ministries={catalogs.ministries}
              images={catalogs.images}
              pillars={catalogs.pillars}
              tokens={catalogs.tokens}
              effectIcons={catalogs.effect_icons}
            />
          </section>
        </div>
      ) : null}

      {ministryOverlayEntry ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-slate-950/90 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMinistryOverlayId("");
          }}
        >
          <section className="w-full max-w-[28rem] border border-amber-900/70 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase text-amber-100">Ministry</h2>
              <button
                className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setMinistryOverlayId("")}
                title="Close Ministry"
                type="button"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <CatalogItemVisual
              entry={ministryOverlayEntry}
              tags={catalogs.tags}
              cards={catalogs.cards}
              ministries={catalogs.ministries}
              images={catalogs.images}
              pillars={catalogs.pillars}
              tokens={catalogs.tokens}
              effectIcons={catalogs.effect_icons}
            />
          </section>
        </div>
      ) : null}

      {empireFallOpen && phase === "game_over" ? (
        <div
          className="fixed inset-0 z-[1500] overflow-y-auto bg-slate-950/95 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEmpireFallOpen(false);
          }}
        >
          <section className="mx-auto w-full max-w-[96rem] border border-rose-900/70 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-bold uppercase text-rose-400">The Empire Has Fallen</p>
                <h2 className="mt-1 text-2xl font-bold text-amber-50">Final Agendas</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {gameState.winner_player_ids?.length
                    ? `Winner${gameState.winner_player_ids.length > 1 ? "s" : ""}: ${gameState.winner_player_ids
                      .map((playerId) => players.find((player) => player.id === playerId)?.name || playerId)
                      .join(", ")}`
                    : "No player completed an eligible Agenda."}
                </p>
              </div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setEmpireFallOpen(false)}
                title="Close final results"
                type="button"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
              {players.map((player) => {
                const result = gameState.agenda_results?.[player.id] || {
                  agenda_id: player.hidden_agenda_id,
                  eligible: false,
                  score: 0,
                  sections: {},
                };
                const agenda = agendaLookup[normalize(result.agenda_id || player.hidden_agenda_id)];
                const winner = gameState.winner_player_ids?.includes(player.id);
                return (
                  <section
                    key={player.id}
                    className="min-w-0"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-white">{player.name}</h3>
                        <p className={`mt-0.5 text-xs font-semibold ${
                          winner ? "text-amber-300" : result.eligible ? "text-emerald-300" : "text-rose-300"
                        }`}>
                          {winner ? "Winner" : result.eligible ? "Agenda achieved" : "Agenda not achieved"}
                        </p>
                      </div>
                      <div className={`flex h-12 min-w-12 flex-col items-center justify-center border ${
                        winner ? "border-amber-500 text-amber-200" : "border-slate-700 text-slate-300"
                      }`}>
                        <strong className="text-lg leading-none">{result.score || 0}</strong>
                        <span className="mt-0.5 text-[0.55rem] font-bold uppercase">Points</span>
                      </div>
                    </div>

                    {agenda ? (
                      <CatalogItemVisual
                        entry={agenda}
                        tags={catalogs.tags}
                        cards={catalogs.cards}
                        ministries={catalogs.ministries}
                        images={catalogs.images}
                        pillars={catalogs.pillars}
                        tokens={catalogs.tokens}
                        effectIcons={catalogs.effect_icons}
                        agendaResult={result}
                      />
                    ) : (
                      <div className="flex aspect-[8/5] items-center justify-center border border-dashed border-slate-700 text-sm text-slate-500">
                        Agenda unavailable
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
};

export default GameRoomPage;
