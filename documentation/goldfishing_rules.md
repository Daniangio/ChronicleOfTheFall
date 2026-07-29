# Goldfishing Engine

The digital engine supports three, four, or five players. Goldfishing exposes
every seat to one browser. Single-player versus bots exposes one human seat and
lets the backend control the remaining seats. In both modes, all legality, phase
transitions, shuffling, costs, placement checks, effects, storage, and cleanup are
resolved by the backend.

The rules source is [`../game_rules.md`](../game_rules.md). This file documents the
digital implementation.

## Setup

- The selected Level provides the initial City and one unified Empire Deck.
- The Deck's incremental setup tiers form the Base Card Pool for the current
  player count.
- Each player receives three random Base cards and two random Empire cards.
- The backend shuffles the complete Agenda catalog and deals two options to each
  player. Agenda selection is parallel: each player keeps one, while the rejected
  card goes to an uninspectable sealed discard.
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

The engine supports Agenda selection, Ministry assignment, Suspicion placement,
Production, parallel anonymous commitments, Docket ordering, reveal and
placement, Edict and Crisis effects, resource storage, Scheme management,
drawing, and cleanup.

In a versus-bots room, deterministic system actions advance automatically. The
room stops advancing when the human has a legal decision. Bot hands, Scheme
cards, Agenda options, and chosen Agendas remain private until the normal rules
reveal them. The browser receives counts for hidden hands and Scheme cards, not
their identities.

Bot decisions use the policy documented in
[`bot_policy.md`](bot_policy.md). Bots submit ordinary legal actions to the same
engine used by the browser; the policy does not modify game state directly.

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

Hidden Agendas are complete catalog cards with four sections:

```json
{
  "max_points": 8,
  "win_threshold": 6,
  "primary_mandatory": true,
  "forbidden_is_veto": true,
  "primary": {"points": 4, "name": "...", "text": "...", "conditions": []},
  "secondary": {"points": 2, "name": "...", "text": "...", "conditions": []},
  "collapse": {"points": 2, "name": "...", "text": "...", "conditions": []},
  "forbidden": {"points": 0, "name": "...", "text": "...", "conditions": []}
}
```

Conditions within a section use AND semantics. On collapse, after the triggering
effect finishes, the backend evaluates all four sections. Primary is mandatory,
Forbidden is a veto, and at least six points are required. Eligible players are
ranked by Agenda score, then by cards remaining in hand plus Scheme Slots; a
remaining tie is shared. Results are exposed in `agenda_results` and winners in
`winner_player_ids`.
