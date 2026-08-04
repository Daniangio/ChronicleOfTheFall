import { Download, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authenticatedFetch } from "../utils/authenticatedFetch.js";
import { buildApiUrl } from "../utils/connection.js";

const ReplayPage = () => {
  const { replayId = "" } = useParams();
  const navigate = useNavigate();
  const [replays, setReplays] = useState([]);
  const [detail, setDetail] = useState(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [error, setError] = useState("");

  const loadList = async () => {
    const response = await authenticatedFetch(buildApiUrl("/api/game/replays"));
    const payload = await response.json().catch(() => []);
    if (!response.ok) throw new Error(payload.detail || "Failed to load replays.");
    setReplays(payload);
    if (!replayId && payload[0]?.id) navigate(`/replays/${payload[0].id}`, { replace: true });
  };

  useEffect(() => {
    loadList().catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!replayId) {
      setDetail(null);
      return;
    }
    authenticatedFetch(buildApiUrl(`/api/game/replays/${replayId}`))
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || "Failed to load replay.");
        setDetail(payload);
        setFrameIndex(Math.max(0, (payload.replay?.frames?.length || 1) - 1));
      })
      .catch((loadError) => setError(loadError.message));
  }, [replayId]);

  const replay = detail?.replay || {};
  const frames = replay.frames || [];
  const frame = frames[frameIndex] || null;
  const itemLookup = useMemo(
    () => Object.fromEntries((replay.catalog?.items || []).map((item) => [item.id, item])),
    [replay]
  );
  const agendaLookup = useMemo(
    () => Object.fromEntries((replay.catalog?.agendas || []).map((item) => [item.id, item])),
    [replay]
  );

  const deleteReplay = async () => {
    if (!replayId || !window.confirm("Delete this replay permanently?")) return;
    const response = await authenticatedFetch(buildApiUrl(`/api/game/replays/${replayId}`), { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.detail || "Failed to delete replay.");
      return;
    }
    const remaining = replays.filter((entry) => entry.id !== replayId);
    setReplays(remaining);
    navigate(remaining[0] ? `/replays/${remaining[0].id}` : "/replays", { replace: true });
  };

  const downloadReplay = () => {
    const blob = new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${replay.room_id || replayId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border border-slate-800 bg-slate-900 p-3">
        <h1 className="text-lg font-bold text-amber-50">Bot Replays</h1>
        <div className="mt-3 space-y-1">
          {replays.map((entry) => (
            <button
              key={entry.id}
              className={`w-full border px-3 py-2 text-left ${entry.id === replayId ? "border-amber-700 bg-amber-950/40" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}
              onClick={() => navigate(`/replays/${entry.id}`)}
              type="button"
            >
              <span className="block text-xs font-bold text-slate-200">Era {entry.era} · {entry.player_count} bots</span>
              <span className="mt-1 block text-[0.65rem] text-slate-500">{new Date(entry.created_at).toLocaleString()}</span>
            </button>
          ))}
          {!replays.length ? <p className="py-5 text-xs text-slate-500">No bot replays saved.</p> : null}
        </div>
      </aside>

      <section className="min-w-0 border border-slate-800 bg-slate-900 p-4">
        {error ? <p className="mb-4 border border-rose-900 bg-rose-950/60 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        {!frame ? <p className="py-12 text-center text-slate-500">Select a replay.</p> : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-amber-600">{replay.format}</p>
                <h2 className="mt-1 text-xl font-bold text-amber-50">Era {frame.era} · {String(frame.phase).replaceAll("_", " ")}</h2>
                <p className="mt-1 text-xs text-slate-500">Action {frame.sequence}: {frame.action}</p>
              </div>
              <div className="flex gap-2">
                <button className="inline-flex h-9 w-9 items-center justify-center border border-slate-700 hover:bg-slate-800" onClick={downloadReplay} title="Download replay JSON" type="button"><Download className="h-4 w-4" /></button>
                <button className="inline-flex h-9 w-9 items-center justify-center border border-rose-900 text-rose-300 hover:bg-rose-950" onClick={deleteReplay} title="Delete replay" type="button"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="mt-5 border-y border-slate-800 py-3">
              <input className="w-full accent-amber-500" type="range" min="0" max={Math.max(0, frames.length - 1)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} />
              <div className="mt-1 flex justify-between text-[0.65rem] text-slate-500"><span>Setup</span><span>{frameIndex + 1}/{frames.length}</span><span>Final</span></div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="grid gap-3 md:grid-cols-2">
                {(frame.cities || []).map((city) => (
                  <article key={city.id} className="border border-amber-900/50 bg-stone-950/70 p-3">
                    <h3 className="font-bold text-amber-100">{city.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{itemLookup[city.city_card_id]?.name || city.city_card_id}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(city.cards || []).map((cardId, index) => <span key={`${cardId}-${index}`} className="border border-slate-700 px-2 py-1 text-xs text-slate-300">{itemLookup[cardId]?.name || cardId}</span>)}
                      {!city.cards?.length ? <span className="text-xs text-slate-600">No Structures</span> : null}
                    </div>
                  </article>
                ))}
              </div>
              <aside className="space-y-3">
                <ReplayValues title="Pillars" values={frame.pillars} />
                <ReplayValues title="Resources" values={frame.resources} />
                <ReplayValues title="Tags" values={frame.tags} />
                <div className="border border-slate-800 bg-slate-950 p-3">
                  <h3 className="text-xs font-bold uppercase text-slate-500">Council</h3>
                  {(frame.players || []).map((player) => <p key={player.id} className="mt-2 text-xs text-slate-300">{player.name}: {agendaLookup[player.agenda_id]?.name || player.agenda_id}</p>)}
                </div>
              </aside>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

const ReplayValues = ({ title, values = {} }) => (
  <div className="border border-slate-800 bg-slate-950 p-3">
    <h3 className="text-xs font-bold uppercase text-slate-500">{title}</h3>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(values).map(([id, value]) => <span key={id} className="border border-slate-700 px-2 py-1 text-xs text-slate-300">{id} {value}</span>)}
      {!Object.keys(values).length ? <span className="text-xs text-slate-600">None</span> : null}
    </div>
  </div>
);

export default ReplayPage;
