# Goldfishing Engine

Goldfishing controls all four prototype players from one browser, but all legality,
phase transitions, shuffling, costs, placement checks, effects, storage, and cleanup
are resolved by the backend.

The rules source is [`../game_rules.md`](../game_rules.md). This file documents the
digital implementation.

## Setup

- The selected Level provides the initial City and one unified Empire Deck.
- The Deck's incremental setup tiers form the Base Card Pool for the current
  player count.
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

Development cards use the clean schema:

```json
{
  "id": "granary",
  "kind": "cards",
  "category": "structure",
  "data": {
    "required_tags": {"urban": 1},
    "cost": {"labor": 1},
    "tags": {"sanitary": 1},
    "production": {"wealth": 1},
    "on_build_effects": [
      {
        "effect_type": "modify_pillar",
        "payload": {"pillar_id": "morale", "amount": 1}
      },
      {
        "effect_type": "modify_token",
        "payload": {"token_id": "fortified-token", "amount": 1}
      }
    ],
    "persistent_effects": [
      {
        "effect_type": "storage",
        "payload": {"amount": 2, "resource_id": ""}
      }
    ]
  }
}
```

Card `category` is either `structure` or `city`. City cards additionally declare
`data.building_slots`; there is no separate Development Type field.

Tokens are fixed catalog ingredients with IDs `plague-token`, `unrest-token`,
and `fortified-token`.
An on-build `modify_token` effect applies to the City where the card is built.
Its signed `amount` adds or removes tokens; token counts cannot fall below zero.

An empty storage `resource_id` accepts any resource. A specific resource id limits
that capacity. `add_building_slots` is the other persistent effect.

Events declare `subtype` as `edict` or `crisis`. All entries in `requirements`
must pass together. Resource requirements are paid; tag and Pillar requirements
are checks. Passing resolves `main_effects`; failing resolves
`alternative_effects`, when present.

Individual effects may also have an optional condition:

```json
{
  "effect_type": "modify_pillar",
  "payload": {
    "pillar_id": "stability",
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
