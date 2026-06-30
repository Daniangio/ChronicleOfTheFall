import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageSubnavigation } from "../components/AuthenticatedLayout.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const playSubnavItems = [{ label: "Solo Play", to: "/play/solo" }];

const SoloPlayPage = () => {
  const { token } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [levels, setLevels] = useState([]);
  const [levelId, setLevelId] = useState("");

  useEffect(() => {
    if (!token) return;
    const loadLevels = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/game/levels"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(payload.detail || "Failed to load levels.");
        setLevels(payload);
        setLevelId((current) => current || payload[0]?.id || "");
      } catch (loadError) {
        setError(loadError.message || "Failed to load levels.");
      }
    };
    void loadLevels();
  }, [token]);

  const selectedLevel = levels.find((level) => level.id === levelId);

  const createChronicleRoom = async () => {
    if (!token || creating || !levelId) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl("/api/game/rooms"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "solo",
          game_type: "chronicle_solo",
          level_id: levelId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to create game room.");
      navigate(`/games/${payload.id}`);
    } catch (createError) {
      setError(createError.message || "Failed to create game room.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageSubnavigation items={playSubnavItems} />

      <section className="mb-5">
        <h1 className="text-2xl font-semibold text-white">Solo Play</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Choose a level, then start a goldfishing room for the empire engine.
        </p>
      </section>

      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <ModeCard title="Campaign" description="A connected sequence of empire chronicles. Prepared for future content." disabled />
        <ModeCard title="Missions" description="Standalone crisis scenarios with specific constraints. Prepared for future content." disabled />
        <ModeCard
          title="Goldfishing"
          description="Start a four-player goldfishing room from a configured level."
          actionLabel={creating ? "Creating..." : "Start"}
          onClick={createChronicleRoom}
          disabled={creating || !levelId}
        >
          <div className="mt-4 grid gap-3">
            <LevelSelect value={levelId} levels={levels} onChange={setLevelId} />
            {selectedLevel ? (
              <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-left text-xs text-slate-400">
                <p><span className="font-semibold text-slate-300">Initial City:</span> {selectedLevel.initial_city_name || selectedLevel.initial_city_card_id || "Missing"}</p>
                <p className="mt-1"><span className="font-semibold text-slate-300">Empire Deck:</span> {selectedLevel.empire_deck_name || selectedLevel.empire_deck_id || "Missing"}</p>
                <p className="mt-1"><span className="font-semibold text-slate-300">Event Deck:</span> {selectedLevel.event_deck_name || selectedLevel.event_deck_id || "Missing"}</p>
                <p className="mt-1"><span className="font-semibold text-slate-300">Common Pool:</span> {selectedLevel.common_pool_deck_name || selectedLevel.common_pool_deck_id || "Missing"}</p>
              </div>
            ) : null}
          </div>
        </ModeCard>
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
