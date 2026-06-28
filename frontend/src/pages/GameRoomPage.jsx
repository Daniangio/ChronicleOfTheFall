import { Check, Hand, Hourglass, Landmark, LogOut, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TagIcon from "../components/TagIcon.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");

const buildLookup = (entries = []) => Object.fromEntries(entries.map((entry) => [normalize(entry.id), entry]));

const tagEntries = (value) => {
  if (Array.isArray(value)) return value.map((tagId) => [tagId, null]);
  return Object.entries(value || {});
};

const manualActionMana = (data = {}) => {
  const node = (data.logic_nodes || []).find((entry) => entry?.trigger === "manual_action");
  if (!node) return {};
  return (node.effects || []).reduce((mana, effect) => {
    if (effect?.effect_type !== "modify_mana") return mana;
    const payload = effect.payload || {};
    const manaType = payload.mana_type || payload.tag_id;
    if (!manaType) return mana;
    return { ...mana, [manaType]: Number(mana[manaType] || 0) + Number(payload.amount || 0) };
  }, {});
};

const CardMini = ({ card, tagLookup, exhausted = false, onExhaust, canExhaust = false, onPropose, canPropose = false }) => {
  const data = card?.data || {};
  const cost = data.cost || {};
  const exhaust = Object.keys(data.exhaust || {}).length ? data.exhaust : manualActionMana(data);
  const tags = data.tags || {};
  const requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const hasExhaust = Object.keys(exhaust).length > 0;
  const exhaustStripClass = "mt-3 flex w-full flex-wrap items-center gap-1.5 border-t border-slate-800 pt-3 text-left";
  const exhaustContents = (
    <>
      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[0.65rem] font-semibold ${
        exhausted ? "border-slate-700 text-slate-500" : "border-amber-700 text-amber-200"
      }`}>
        <Zap className="h-3 w-3" aria-hidden="true" />
        {exhausted ? "Exhausted" : "Exhaust"}
      </span>
      {Object.entries(exhaust).map(([tagId, count]) => (
        <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={count} />
      ))}
    </>
  );

  return (
    <article className={`flex min-h-[12rem] flex-col rounded-lg border bg-slate-950 p-3 ${exhausted ? "border-amber-600/70 opacity-70" : "border-slate-800"}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-slate-700 px-2 py-1 text-[0.65rem] font-semibold text-slate-300">
          T{data.tier || 0}
        </span>
        {Object.entries(cost).map(([tagId, count]) => (
          <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={count} />
        ))}
      </div>

      <h3 className="mt-3 text-sm font-semibold text-white">{card?.name || "Unknown Card"}</h3>
      <p className="mt-1 text-[0.7rem] uppercase tracking-normal text-slate-500">{card?.category || "uncategorized"}</p>

      <div className="mt-3 min-h-[2rem] space-y-1">
        {requirements.map((requirement, index) => (
          requirement?.type === "not_condition" ? (
            <div key={index} className="flex flex-wrap items-center gap-1">
              <span className="rounded-md border border-rose-700 px-2 py-1 text-[0.65rem] font-semibold text-rose-300">NO</span>
              <TagIcon tag={tagLookup[normalize(requirement.tag_id)]} label={requirement.tag_id} />
            </div>
          ) : (
            <span key={index} className="inline-flex rounded-md border border-slate-700 px-2 py-1 text-[0.65rem] font-semibold text-slate-300">
              HAS {String(requirement.card_id || "").toUpperCase()}
            </span>
          )
        ))}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {tagEntries(tags).map(([tagId, count]) => (
          <TagIcon key={tagId} tag={tagLookup[normalize(tagId)]} label={tagId} count={count || null} />
        ))}
      </div>

      {hasExhaust ? (
        canExhaust ? (
          <button
            className={`${exhaustStripClass} rounded-md hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={exhausted}
            onClick={onExhaust}
            type="button"
          >
            {exhaustContents}
          </button>
        ) : (
          <div className={exhaustStripClass}>{exhaustContents}</div>
        )
      ) : null}

      {canPropose ? (
        <button
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-teal-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-300"
          onClick={onPropose}
          type="button"
        >
          <Hand className="h-4 w-4" aria-hidden="true" />
          Project
        </button>
      ) : null}
    </article>
  );
};

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
          const available = Number(focusedPlayer?.mana?.[tagId] || 0);
          const complete = current >= Number(required);
          return (
            <span key={tagId} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1">
              <TagIcon tag={tagLookup[normalize(tagId)]} label={tagId} count={`${current}/${required}`} />
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
  const tagLookup = useMemo(() => buildLookup(gameState?.catalog?.tags || []), [gameState]);
  const ministryLookup = useMemo(() => buildLookup(gameState?.catalog?.ministries || []), [gameState]);
  const players = gameState?.players || [];
  const activePlayer = players.find((player) => player.id === gameState?.active_player_id);
  const focusedPlayer = players.find((player) => player.id === focusedPlayerId) || players[0];
  const cities = gameState?.cities || [];
  const city = cities[0];
  const eventLookup = useMemo(() => buildLookup(gameState?.catalog?.events || []), [gameState]);
  const possibleActions = gameState?.possible_actions || [];
  const phase = gameState?.phase || "administration";
  const selectedMinistries = gameState?.selected_ministries || {};
  const buildActions = possibleActions.filter((entry) => entry.type === "build_project");
  const citiesWithGroups = useMemo(() => cities.map((cityEntry) => {
    const groups = {};
    for (const cardId of cityEntry.cards || []) {
      const card = cardLookup[normalize(cardId)];
      const category = card?.category || "uncategorized";
      groups[category] = [...(groups[category] || []), cardId];
    }
    return {
      city: cityEntry,
      buildActions: buildActions.filter((entry) => entry.city_id === cityEntry.id),
      groups: Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)),
    };
  }), [buildActions, cardLookup, cities]);

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
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const hasAction = (type, matcher = () => true) =>
    possibleActions.some((entry) => entry.type === type && matcher(entry));

  const canContinuePhase = hasAction("continue_phase");
  const canPass = activePlayer && hasAction("pass", (entry) => entry.player_id === activePlayer.id);

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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <p className="text-sm text-slate-400">{error || "Loading game..."}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
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
              </div>
              {canContinuePhase ? (
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
            <div className="space-y-4">
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
                    return (
                      <article key={`${eventId}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <p className="text-sm font-semibold text-white">{event?.name || eventId}</p>
                        <p className="mt-1 text-xs uppercase text-slate-500">{event?.category || "event"}</p>
                        <p className="mt-3 text-xs leading-5 text-slate-400">{event?.summary || "No event text."}</p>
                      </article>
                    );
                  })}
                  {(gameState.event_queue || []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-600">No active events.</p>
                  ) : null}
                </div>
              </section>

              {citiesWithGroups.map(({ city: cityEntry, buildActions: cityBuildActions, groups }) => {
                const exhaustedIds = cityEntry.exhausted_card_ids || [];
                return (
                  <section key={cityEntry.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2">
                      <Landmark className="h-5 w-5 text-teal-300" aria-hidden="true" />
                      <div>
                        <h1 className="text-xl font-semibold text-white">{cityEntry.name || "City"}</h1>
                        <p className="text-xs text-slate-500">Active player: {activePlayer?.name || "None"}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {cityEntry.foundation_card_id ? (
                        <CardMini
                          card={cardLookup[normalize(cityEntry.foundation_card_id)]}
                          tagLookup={tagLookup}
                          exhausted={exhaustedIds.includes(cityEntry.foundation_card_id)}
                          canExhaust={hasAction("exhaust_card", (entry) => entry.card_id === cityEntry.foundation_card_id && entry.city_id === cityEntry.id)}
                          onExhaust={() => action("/actions/exhaust", {
                            player_id: activePlayer.id,
                            city_id: cityEntry.id,
                            card_id: cityEntry.foundation_card_id,
                          })}
                        />
                      ) : null}
                      {cityBuildActions.map((entry) => (
                        <BuildOptionCard
                          key={`${entry.project_id}-${entry.city_id}`}
                          card={cardLookup[normalize(entry.card_id)]}
                          cityName={cityEntry.name || "city"}
                          disabled={busy}
                          onBuild={() => action("/actions/build-project", {
                            player_id: activePlayer.id,
                            project_id: entry.project_id,
                            city_id: entry.city_id,
                          })}
                        />
                      ))}
                    </div>

                    {groups.map(([category, cardIds]) => (
                      <div key={category} className="mt-5 space-y-3">
                        <h2 className="border-b border-slate-800 pb-2 text-sm font-semibold uppercase tracking-normal text-slate-400">{category}</h2>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {cardIds.map((cardId, index) => (
                            <CardMini
                              key={`${cardId}-${index}`}
                              card={cardLookup[normalize(cardId)]}
                              tagLookup={tagLookup}
                              exhausted={exhaustedIds.includes(cardId)}
                              canExhaust={hasAction("exhaust_card", (entry) => entry.card_id === cardId && entry.city_id === cityEntry.id)}
                              onExhaust={() => action("/actions/exhaust", { player_id: activePlayer.id, city_id: cityEntry.id, card_id: cardId })}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
              {citiesWithGroups.length === 0 ? (
                <section className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-500">
                  No city zones available.
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
                      city_id: city?.id || "capital",
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {(focusedPlayer?.hand || []).map((cardId, index) => (
                    <CardMini
                      key={`${cardId}-${index}`}
                      card={cardLookup[normalize(cardId)]}
                      tagLookup={tagLookup}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {(gameState.common_pool || []).map((cardId, index) => (
                    <CardMini
                      key={`${cardId}-${index}`}
                      card={cardLookup[normalize(cardId)]}
                      tagLookup={tagLookup}
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
    </main>
  );
};

export default GameRoomPage;
