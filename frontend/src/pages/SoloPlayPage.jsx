import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageSubnavigation } from "../components/AuthenticatedLayout.jsx";
import { useStore } from "../store.js";
import { authenticatedFetch } from "../utils/authenticatedFetch.js";
import { buildApiUrl } from "../utils/connection.js";

const playSubnavItems = [{ label: "Solo Play", to: "/play/solo" }];

const SoloPlayPage = () => {
  const { token } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [creatingMode, setCreatingMode] = useState("");
  const [levels, setLevels] = useState([]);
  const [levelId, setLevelId] = useState("");
  const [playerCount, setPlayerCount] = useState(4);
  const [agendas, setAgendas] = useState([]);
  const [botAgendaIds, setBotAgendaIds] = useState([]);

  useEffect(() => {
    if (!token) return;
    const loadLevels = async () => {
      try {
        const [levelsResponse, agendasResponse] = await Promise.all([
          authenticatedFetch(buildApiUrl("/api/game/levels")),
          authenticatedFetch(buildApiUrl("/api/game/agendas")),
        ]);
        const levelPayload = await levelsResponse.json().catch(() => []);
        const agendaPayload = await agendasResponse.json().catch(() => []);
        if (!levelsResponse.ok) throw new Error(levelPayload.detail || "Failed to load levels.");
        if (!agendasResponse.ok) throw new Error(agendaPayload.detail || "Failed to load Agendas.");
        setLevels(levelPayload);
        setLevelId((current) => current || levelPayload[0]?.id || "");
        setAgendas(agendaPayload);
        setBotAgendaIds((current) => Array.from(
          { length: playerCount },
          (_, index) => current[index] || agendaPayload[index]?.id || agendaPayload[0]?.id || ""
        ));
      } catch (loadError) {
        setError(loadError.message || "Failed to load levels.");
      }
    };
    void loadLevels();
  }, [token]);

  const selectedLevel = levels.find((level) => level.id === levelId);

  const createChronicleRoom = async (mode) => {
    if (!token || creatingMode || !levelId) return;
    setCreatingMode(mode);
    setError("");
    try {
      const response = await authenticatedFetch(buildApiUrl("/api/game/rooms"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          game_type: "chronicle_solo",
          level_id: levelId,
          player_count: playerCount,
          agenda_ids: mode === "bots_only" ? botAgendaIds.slice(0, playerCount) : [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to create game room.");
      navigate(`/games/${payload.id}`);
    } catch (createError) {
      setError(createError.message || "Failed to create game room.");
    } finally {
      setCreatingMode("");
    }
  };

  const updatePlayerCount = (count) => {
    setPlayerCount(count);
    setBotAgendaIds((current) => Array.from(
      { length: count },
      (_, index) => current[index] || agendas[index]?.id || agendas[0]?.id || ""
    ));
  };

  return (
    <>
      <PageSubnavigation items={playSubnavItems} />

      <section className="mb-5">
        <h1 className="text-2xl font-semibold text-white">Solo Play</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Choose a level and council size, then control every seat or play against Agenda-driven bots.
        </p>
      </section>

      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <section className="mb-4 grid gap-4 border border-slate-800 bg-slate-900 p-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          <LevelSelect value={levelId} levels={levels} onChange={setLevelId} />
          <PlayerCountControl value={playerCount} onChange={updatePlayerCount} />
        </div>
        {selectedLevel ? (
          <div className="border-l-0 border-slate-800 text-left text-xs text-slate-400 lg:border-l lg:pl-4">
            <p><span className="font-semibold text-slate-300">Initial City:</span> {selectedLevel.initial_city_name || selectedLevel.initial_city_card_id || "Missing"}</p>
            <p className="mt-1"><span className="font-semibold text-slate-300">Foundation Deck:</span> {selectedLevel.foundation_deck_name || selectedLevel.foundation_deck_id || "Missing"}</p>
            <p className="mt-1"><span className="font-semibold text-slate-300">Institution Deck:</span> {selectedLevel.institution_deck_name || selectedLevel.institution_deck_id || "Missing"}</p>
            <p className="mt-1"><span className="font-semibold text-slate-300">Crisis Deck:</span> {selectedLevel.crisis_deck_name || selectedLevel.crisis_deck_id || "Missing"}</p>
            <p className="mt-1"><span className="font-semibold text-slate-300">Available Cities:</span> {selectedLevel.available_city_count}</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ModeCard title="Campaign" description="A connected sequence of empire chronicles. Prepared for future content." disabled />
        <ModeCard title="Missions" description="Standalone crisis scenarios with specific constraints. Prepared for future content." disabled />
        <ModeCard
          title="Goldfishing"
          description={`Control all ${playerCount} council seats and inspect every hand and Agenda.`}
          actionLabel={creatingMode === "goldfishing" ? "Creating..." : "Start"}
          onClick={() => createChronicleRoom("goldfishing")}
          disabled={Boolean(creatingMode) || !levelId}
        />
        <ModeCard
          title="Bots Only"
          description={`Watch ${playerCount} Agenda-driven bots play a complete chronicle. The replay is saved for review and statistics.`}
          actionLabel={creatingMode === "bots_only" ? "Creating..." : "Start simulation"}
          onClick={() => createChronicleRoom("bots_only")}
          disabled={
            Boolean(creatingMode)
            || !levelId
            || botAgendaIds.slice(0, playerCount).some((agendaId) => !agendaId)
          }
        >
          <div className="mt-4 space-y-2">
            {Array.from({ length: playerCount }, (_, index) => (
              <label key={index} className="block">
                <span className="text-[0.65rem] font-bold uppercase text-slate-500">Bot {index + 1}</span>
                <select
                  className="mt-1 w-full border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                  value={botAgendaIds[index] || ""}
                  onChange={(event) => setBotAgendaIds((current) => {
                    const next = [...current];
                    next[index] = event.target.value;
                    return next;
                  })}
                >
                  {agendas.map((agenda) => <option key={agenda.id} value={agenda.id}>{agenda.name}</option>)}
                  {!agendas.length ? <option value="">No Agendas available</option> : null}
                </select>
              </label>
            ))}
          </div>
        </ModeCard>
        <ModeCard
          title="Versus Bots"
          description={`Control one seat against ${playerCount - 1} bots guided by their private Agendas and Ministry rotation.`}
          actionLabel={creatingMode === "solo_bots" ? "Creating..." : "Start"}
          onClick={() => createChronicleRoom("solo_bots")}
          disabled={Boolean(creatingMode) || !levelId}
        />
      </section>
    </>
  );
};

const LevelSelect = ({ value, levels, onChange }) => (
  <label className="block text-left">
    <span className="text-xs font-semibold uppercase tracking-normal text-slate-500">Level</span>
    <select
      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {levels.map((level) => (
        <option key={level.id} value={level.id}>{level.name}</option>
      ))}
      {!levels.length ? <option value="">No level available</option> : null}
    </select>
  </label>
);

const PlayerCountControl = ({ value, onChange }) => (
  <fieldset>
    <legend className="text-xs font-semibold uppercase tracking-normal text-slate-500">Council Size</legend>
    <div className="mt-2 grid grid-cols-3 border border-slate-700">
      {[3, 4, 5].map((count) => (
        <button
          key={count}
          className={`px-3 py-2 text-sm font-semibold ${value === count ? "bg-amber-300 text-stone-950" : "bg-slate-950 text-slate-300 hover:bg-slate-800"}`}
          onClick={() => onChange(count)}
          type="button"
        >
          {count}
        </button>
      ))}
    </div>
  </fieldset>
);

const ModeCard = ({ title, description, actionLabel = "Coming soon", disabled = false, onClick, children = null }) => (
  <article className="flex min-h-[15rem] flex-col justify-between rounded-lg border border-slate-800 bg-slate-900 p-5">
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      {children}
    </div>
    <button
      className="mt-6 rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:border disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {actionLabel}
    </button>
  </article>
);

export default SoloPlayPage;
