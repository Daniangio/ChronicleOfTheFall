# Chronicle of the Fall: Goldfishing Rules v0

This document tracks the playable rules implemented in the prototype. It is the development reference for current behavior, not the final board-game rulebook.

## Mode

Goldfishing mode is a four-player solo simulation of the empire engine.

Version 0 intentionally excludes roles, jurisdiction checks, event resolution, hidden agendas, founding new cities, and multiplayer permissions. All game mutations are executed by the backend; the frontend only displays state and sends action requests.

## Setup

1. The backend creates a room in `chronicle_solo` mode.
2. The latest available card deck and event deck are selected from the admin catalog. If no deck exists, the backend falls back to available catalog cards and events.
3. One capital city is created and its capital foundation card is placed in play.
4. Four players are created in fixed turn order.
5. Each player draws three cards from the selected card deck.
6. Player 1 becomes the active player.

Events are loaded into an event deck. The first epoch starts directly in Administration; later epochs reveal one event before Administration.

## Board Zones

The central board shows the capital city. City cards are grouped by card category, such as foundation, institution, or route.

The project zone can hold up to three projects. A project is a card from a player's hand or the common pool that is waiting for its cost to be paid, then built into an eligible city zone.

The common pool is a shared set of cards loaded from the latest deck whose `deck_type` is `common-pool`. Cards in the common pool are shown next to the focused player's hand and can be proposed by the active player.

The focused player board appears at the bottom of the screen. The focused player can be changed by clicking a player in the left turn-order panel. The active player is the player whose turn is currently being resolved.

## Cards

Cards display:

- Tier and cost chips at the top.
- Requirements below the title.
- Tags in the body.
- Manual action production at the bottom.

Requirements are enforced when a completed project is built. A completed project only shows build options in city zones where its requirements are satisfied.

## Turn Actions

Each epoch moves through explicit phases tracked by the backend and shown by the UI:

1. Event: reveal one event from the event deck into the event queue. The first epoch skips this phase. If the event deck is empty, no event is revealed.
2. Event Resolution: resolve active events. In v0, event cards are visual only and have no effects.
3. Administration: players act in turn order.
4. Decay: unfinished contributions are wiped, completed unbuilt projects remain available, and exhausted cards refresh.

## Turn Actions

During a player's Administration turn, the backend returns every legal action for the UI to render.

Limited action:

- Exhaust a ready card in the capital city to execute a `manual_action` logic node. In v0 this usually marks the card exhausted and adds volatile mana to the active player's pool. This can be performed at most once per player turn and does not end the turn.

Free actions:

- Assign volatile mana from the active player's pool onto a project.
- Build a completed project into an eligible city zone. The backend returns one build action per valid target, and the UI shows those targets as semi-transparent build options in the matching zones.

Turn-ending action:

- Propose a project by moving one card from hand or from the common pool into the project zone. If the project zone is full, the oldest project is discarded.
- Pass.

Proposing a project and Pass end the current player's turn. In both cases, the player's volatile mana pool is emptied and active player advances to the next non-passed player in turn order.

If the backend calculates that a player has no legal action except Pass, that player is auto-passed. The Administration phase ends when all players pass across the round robin.

## Mana And Projects

Mana tokens are volatile and are stored on player boards only during that player's current turn.

Players can assign stored mana tokens to projects through backend action endpoints. Projects do not build automatically. Once a project is complete, any active player can use the free Build Project action to place it into a city where its requirements are satisfied.

During Decay:

- Completed projects remain in the project zone if nobody built them.
- All unfinished project contributions are wiped to zero.
- All exhausted cards refresh.

Newly built cards are ready immediately, though the current player may already have used their once-per-turn Exhaust action.

## Card Logic Nodes

Cards can define dynamic behavior with `logic_nodes`, using the Trigger-Precondition-Effect model.

Supported v0 triggers:

- `manual_action`
- `on_event_phase_start`
- `on_epoch_end`

Supported v0 precondition condition shape:

```json
{
  "target": "this_card",
  "variable": "is_exhausted",
  "operator": "==",
  "value": false
}
```

Supported v0 effect types:

- `set_state`, currently used for `{"variable": "is_exhausted", "value": true}`.
- `modify_mana`, used for adding or removing volatile mana from the active player's pool.
- `modify_token`, `move_card`, and `draw_card` are part of the schema and will be wired incrementally.

Legacy `exhaust` metadata remains supported as a shortcut. If a card has no matching `manual_action` logic node, the backend builds an equivalent exhaust action from `exhaust`.

## Admin Catalog

Decks are catalog entries with kind `decks`.

The backend does not create default game items from Python. A new database starts with an empty catalog. Reusable defaults and templates live under `catalog/` as JSON files and are loaded through the admin console import controls.

A card deck uses:

```json
{
  "deck_type": "cards",
  "item_ids": ["lumber-camp", "militia-garrison"]
}
```

An event deck uses:

```json
{
  "deck_type": "events",
  "item_ids": ["black-year", "barbarian-incursion"]
}
```

A common pool deck uses:

```json
{
  "deck_type": "common-pool",
  "item_ids": ["lumber-camp", "market-hub"]
}
```

The admin console exposes deck creation, modification, deletion, export, and import alongside the other catalog pages.

Cards can also be configured with `logic_nodes` from the guided card editor. The existing cost and exhaust controls are still available for simple cards.
