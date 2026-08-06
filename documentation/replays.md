# Bot Game Replays

Bot-only games are backend jobs. Creating one adds a Redis stream command and a
per-user simulation entry; the game worker runs the bot loop without opening a
browser game room. The Solo Play menu polls and displays `QUEUED`, `RUNNING`,
`FINISHED`, and `FAILED` jobs. Finished jobs link to their replay.

During execution, the game records compact replay frames in runtime state. When
the Empire falls, the worker saves one immutable replay document in the SQL
`game_replays` table and marks the job finished with that replay ID. Redis room
and queue state remains temporary and is not used as the statistics source.

Replay JSON uses `format: chronicle-replay-v1` and contains:

- room, Level, deck, mode, and player-count metadata;
- stable names and IDs for cards, events, tags, and Agendas used by the game;
- an ordered list of action frames;
- each frame's Era, phase, board, resources, tags, pillars, tokens, players, and
  Docket outcomes;
- a full read-only game-state snapshot per frame, with the complete game catalog
  stored once per replay, for playback through the normal game UI;
- final Agenda scores and winners.

The replay does not embed image binaries. It retains catalog image references
so normal card components can resolve repository-hosted assets during playback.

The replay viewer offers a compact summary and a read-only Game Board mode. Game
Board mode renders through the normal game page components and supports manual
seeking, stepping, play/pause, and `0.5x`, `1x`, `2x`, or `4x` playback. Legacy
compact replays remain available in summary mode.

The admin Statistics page computes its results from all saved replay documents
or from an explicitly selected subset. Deleting a replay removes it from future
statistics immediately.
