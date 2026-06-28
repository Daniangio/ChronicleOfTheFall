import { useEffect, useMemo, useState } from "react";
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
  const [decks, setDecks] = useState([]);
  const [empireDeckId, setEmpireDeckId] = useState("");
  const [eventDeckId, setEventDeckId] = useState("");

  useEffect(() => {
    if (!token) return;
    const loadDecks = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/game/decks"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => []);
        if (!response.ok) throw new Error(payload.detail || "Failed to load decks.");
        setDecks(payload);
        const empireDeck = payload.find((deck) => deck.deck_type === "empire");
        const eventDeck = payload.find((deck) => deck.deck_type === "events");
        setEmpireDeckId((current) => current || empireDeck?.id || "");
        setEventDeckId((current) => current || eventDeck?.id || "");
      } catch (loadError) {
        setError(loadError.message || "Failed to load decks.");
      }
    };
    void loadDecks();
  }, [token]);

  const empireDecks = useMemo(() => decks.filter((deck) => deck.deck_type === "empire"), [decks]);
  const eventDecks = useMemo(() => decks.filter((deck) => deck.deck_type === "events"), [decks]);

  const createChronicleRoom = async () => {
    if (!token || creating) return;
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
          empire_deck_id: empireDeckId || null,
          event_deck_id: eventDeckId || null,
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
          Start a solo Chronicle room for the cooperative empire-collapse engine.
        </p>
      </section>

      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <ModeCard
          title="Campaign"
          description="A connected sequence of empire chronicles. Prepared for future content."
          disabled
        />
        <ModeCard
          title="Missions"
          description="Standalone crisis scenarios with specific historical constraints. Prepared for future content."
          disabled
        />
        <ModeCard
          title="Chronicle Solo"
          description="Create a solo room immediately while the empire engine is being built."
          actionLabel={creating ? "Creating..." : "Start"}
          onClick={createChronicleRoom}
          disabled={creating}
        >
          <div className="mt-4 grid gap-3">
            <DeckSelect label="Empire Deck" value={empireDeckId} decks={empireDecks} onChange={setEmpireDeckId} />
            <DeckSelect label="Event Deck" value={eventDeckId} decks={eventDecks} onChange={setEventDeckId} allowEmpty />
          </div>
        </ModeCard>
      </section>
    </>
  );
};

const DeckSelect = ({ label, value, decks, onChange, allowEmpty = false }) => (
  <label className="block text-left">
    <span className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</span>
    <select
      className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowEmpty ? <option value="">Empty</option> : null}
      {decks.map((deck) => (
        <option key={deck.id} value={deck.id}>{deck.name} ({deck.item_count})</option>
      ))}
      {!decks.length && !allowEmpty ? <option value="">No deck available</option> : null}
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
