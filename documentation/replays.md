# Bot Game Replays

Bot-only games record compact replay frames in runtime state. When the Empire
falls, or the owner ends the simulation, the backend saves one immutable replay
document in the SQL `game_replays` table. Redis room state remains temporary and
is not used as the statistics source.

Replay JSON uses `format: chronicle-replay-v1` and contains:

- room, Level, deck, mode, and player-count metadata;
- stable names and IDs for cards, events, tags, and Agendas used by the game;
- an ordered list of action frames;
- each frame's Era, phase, board, resources, tags, pillars, tokens, players, and
  Docket outcomes;
- final Agenda scores and winners.

The replay does not contain image data or filesystem image paths.

The admin Statistics page computes its results from all saved replay documents
or from an explicitly selected subset. Deleting a replay removes it from future
statistics immediately.
