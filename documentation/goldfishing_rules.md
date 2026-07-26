# Goldfishing Engine

Goldfishing controls all four prototype players from one browser, but all legality,
phase transitions, shuffling, costs, placement checks, effects, storage, and cleanup
are resolved by the backend.

The rules source is [`../game_rules.md`](../game_rules.md). This file documents the
digital implementation.

## Setup

- The selected Level provides the initial City, Empire Deck, Crisis Deck, and Base
  Card Pool.
- Each player receives three random Base cards and two random Empire cards.
- Each player receives one configured Hidden Agenda when enough Agenda cards exist.
- The initial City enters play without consuming one of its own building slots.
- Pillars use their configured starting values, with Treasury, Stability, and Morale
  defaulting to five when no Pillar catalog exists.

## Runtime Contract

The game state exposes `possible_actions`. The client may render only those actions
and submits one through `POST /api/game/rooms/{room_id}/actions`:

```json
{
  "action": "commit_card",
  "payload": {
    "player_id": "player-2",
    "source": "hand",
    "index": 0
  }
}
```

The engine supports Ministry drafting, Suspicion placement, Production, queued
project resolution, anonymous commitments, reveal and placement, stalled-project
voting, Crisis defense, resource storage, Scheme management, drawing, and cleanup.

## Catalog Data

Cards retain the existing catalog schema and add:

```json
{
  "storage": {
    "capacity": 2,
    "mode": "generic"
  },
  "built_pillar_modifiers": [
    {
      "pillar_id": "morale",
      "amount": 1
    }
  ]
}
```

Specific storage uses `"mode": "specific"` plus `resource_id`. Production can be
stored in `production` or in persistent logic nodes that add resources.

Event effects may have an optional condition:

```json
{
  "effect_type": "modify_pillar",
  "payload": {
    "pillar": "stability",
    "amount": -1
  },
  "condition": {
    "source_type": "tag",
    "source_id": "military",
    "operator": "lt",
    "amount": 2
  }
}
```

Condition sources are `tag`, `resource`, or `pillar`; operators are `gt`, `gte`,
`lt`, `lte`, and `eq`. Effects resolve in listed order, so an earlier resource
effect can change whether a later condition is satisfied.

Hidden Agendas use the same `conditions` shape and may set `condition_mode` to
`all` (the default) or `any`. When a Pillar reaches zero, the backend reveals all
Agendas and records every player whose Agenda is satisfied in `winner_player_ids`.
