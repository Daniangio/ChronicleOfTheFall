import { ChevronLeft, ChevronRight, Download, List, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import GameRoomPage from "./GameRoomPage.jsx";
import { authenticatedFetch } from "../utils/authenticatedFetch.js";
import { buildApiUrl } from "../utils/connection.js";

const ReplayPage = () => {
  const { replayId = "" } = useParams();
  const navigate = useNavigate();
  const [replays, setReplays] = useState([]);
  const [detail, setDetail] = useState(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [viewMode, setViewMode] = useState("summary");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
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
        setPlaying(false);
        setViewMode("summary");
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
  const exactReplayAvailable = Boolean(frame?.state && replay.catalog?.game);
  const exactGameState = useMemo(() => {
    if (!frame?.state || !replay.catalog?.game) return null;
    return {
      ...frame.state,
      catalog: replay.catalog.game,
      possible_actions: [],
      replay_enabled: false,
    };
  }, [frame, replay]);
  const finalFrame = frames[frames.length - 1] || null;
  const showingFinalFrame = Boolean(finalFrame && frameIndex === frames.length - 1);

  useEffect(() => {
    if (!playing || viewMode !== "game" || !frames.length) return undefined;
    if (frameIndex >= frames.length - 1) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setFrameIndex((current) => Math.min(frames.length - 1, current + 1));
    }, 1200 / speed);
    return () => window.clearTimeout(timer);
  }, [frameIndex, frames.length, playing, speed, viewMode]);

  const deleteReplay = async (targetId = replayId) => {
    if (!targetId || !window.confirm("Delete this replay permanently?")) return;
    const response = await authenticatedFetch(buildApiUrl(`/api/game/replays/${targetId}`), { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.detail || "Failed to delete replay.");
      return;
    }
    const remaining = replays.filter((entry) => entry.id !== targetId);
    setReplays(remaining);
    if (targetId === replayId) {
      navigate(remaining[0] ? `/replays/${remaining[0].id}` : "/replays", { replace: true });
    }
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

  const openGameReplay = () => {
    if (!exactReplayAvailable) return;
    setPlaying(false);
    setFrameIndex(0);
    setViewMode("game");
  };

  if (viewMode === "game" && exactGameState) {
    return (
      <div className="fixed inset-0 z-[1600] bg-slate-950">
        <GameRoomPage
          replayState={exactGameState}
          replaySpeed={speed}
          replayControls={(
            <ReplayControls
              frameIndex={frameIndex}
              frameCount={frames.length}
              playing={playing}
              speed={speed}
              onBack={() => {
                setPlaying(false);
                setViewMode("summary");
              }}
              onPrevious={() => {
                setPlaying(false);
                setFrameIndex((current) => Math.max(0, current - 1));
              }}
              onPlay={() => {
                if (frameIndex >= frames.length - 1) setFrameIndex(0);
                setPlaying((current) => !current);
              }}
              onNext={() => {
                setPlaying(false);
                setFrameIndex((current) => Math.min(frames.length - 1, current + 1));
              }}
              onSeek={(index) => {
                setPlaying(false);
                setFrameIndex(index);
              }}
              onSpeed={setSpeed}
            />
          )}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border border-slate-800 bg-slate-900 p-3">
        <h1 className="text-lg font-bold text-amber-50">Bot Replays</h1>
        <div className="mt-3 space-y-1">
          {replays.map((entry) => (
            <div key={entry.id} className={`flex border ${entry.id === replayId ? "border-amber-700 bg-amber-950/40" : "border-slate-800 bg-slate-950"}`}>
              <button
                className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-slate-900"
                onClick={() => navigate(`/replays/${entry.id}`)}
                type="button"
              >
                <span className="block text-xs font-bold text-slate-200">Era {entry.era} · {entry.player_count} bots</span>
                <span className="mt-1 block text-[0.65rem] text-slate-500">{new Date(entry.created_at).toLocaleString()}</span>
              </button>
              <button
                className="inline-flex w-9 shrink-0 items-center justify-center border-l border-rose-900/70 text-rose-300 hover:bg-rose-950"
                onClick={() => deleteReplay(entry.id)}
                title="Delete replay"
                type="button"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
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
                <div className="flex border border-slate-700">
                  <button className="bg-amber-300 px-3 text-xs font-bold text-stone-950" type="button">Summary</button>
                  <button
                    className="border-l border-slate-700 px-3 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
                    disabled={!exactReplayAvailable}
                    onClick={openGameReplay}
                    title={exactReplayAvailable ? "Replay through the normal game board" : "This legacy replay does not contain full game snapshots"}
                    type="button"
                  >
                    Game Board
                  </button>
                </div>
                <button className="inline-flex h-9 w-9 items-center justify-center border border-slate-700 hover:bg-slate-800" onClick={downloadReplay} title="Download replay JSON" type="button"><Download className="h-4 w-4" /></button>
                <button className="inline-flex h-9 w-9 items-center justify-center border border-rose-900 text-rose-300 hover:bg-rose-950" onClick={() => deleteReplay()} title="Delete replay" type="button"><Trash2 className="h-4 w-4" /></button>
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
            {showingFinalFrame ? (
              <ReplayScoreboard
                players={finalFrame.players || []}
                results={(replay.final || {}).agenda_results || finalFrame.agenda_results || {}}
                winnerPlayerIds={(replay.final || {}).winner_player_ids || finalFrame.winner_player_ids || []}
                agendaLookup={agendaLookup}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
};

const ReplayControls = ({
  frameIndex,
  frameCount,
  playing,
  speed,
  onBack,
  onPrevious,
  onPlay,
  onNext,
  onSeek,
  onSpeed,
}) => (
  <div className="flex items-center gap-1.5">
    <button className="inline-flex h-8 items-center gap-1 border border-slate-700 px-2 text-xs font-bold text-slate-200 hover:bg-slate-800" onClick={onBack} title="Return to summary" type="button">
      <List className="h-3.5 w-3.5" aria-hidden="true" />
      Summary
    </button>
    <button className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:text-slate-600" disabled={frameIndex <= 0} onClick={onPrevious} title="Previous frame" type="button">
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
    </button>
    <button className="inline-flex h-8 w-8 items-center justify-center bg-amber-300 text-stone-950 hover:bg-amber-200" onClick={onPlay} title={playing ? "Pause" : "Play"} type="button">
      {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
    </button>
    <button className="inline-flex h-8 w-8 items-center justify-center border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:text-slate-600" disabled={frameIndex >= frameCount - 1} onClick={onNext} title="Next frame" type="button">
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </button>
    <span className="min-w-14 text-center text-[0.65rem] font-semibold text-slate-400">{frameIndex + 1}/{frameCount}</span>
    <input
      aria-label="Replay position"
      className="w-24 accent-amber-500"
      max={Math.max(0, frameCount - 1)}
      min="0"
      onChange={(event) => onSeek(Number(event.target.value))}
      type="range"
      value={frameIndex}
    />
    <div className="flex border border-slate-700" aria-label="Replay speed">
      {[0.5, 1, 2, 4].map((value) => (
        <button
          key={value}
          className={`h-8 min-w-8 px-1 text-[0.65rem] font-bold ${speed === value ? "bg-teal-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}
          onClick={() => onSpeed(value)}
          type="button"
        >
          {value}x
        </button>
      ))}
    </div>
  </div>
);

const ReplayScoreboard = ({ players, results, winnerPlayerIds, agendaLookup }) => (
  <section className="mt-5 border-t border-amber-900/60 pt-4">
    <h3 className="text-sm font-bold uppercase text-amber-300">Final Agenda Points</h3>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {players.map((player) => {
        const result = results[player.id] || {};
        const winner = winnerPlayerIds.includes(player.id);
        return (
          <div key={player.id} className={`flex items-center justify-between border px-3 py-2 ${winner ? "border-amber-500 bg-amber-950/35" : "border-slate-800 bg-slate-950"}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-100">{player.name}</p>
              <p className="truncate text-xs text-slate-500">{agendaLookup[player.agenda_id]?.name || player.agenda_id || "No Agenda"}</p>
            </div>
            <strong className={winner ? "text-xl text-amber-300" : "text-xl text-slate-300"}>{Number(result.score || 0)}</strong>
          </div>
        );
      })}
    </div>
  </section>
);

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
