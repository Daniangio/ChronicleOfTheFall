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
5. Each player draws four cards from the selected card deck.
6. Player 1 becomes the active player.

Events are loaded into an event deck but do not resolve yet.

## Board Zones

The central board shows the capital city. City cards are grouped by card category, such as foundation, institution, or route.

The project zone can hold up to three projects. A project is a card from a player's hand that is waiting for its cost to be paid. The design target is a common pool/market source; v0 still uses player hands as the project source.

The focused player board appears at the bottom of the screen. The focused player can be changed by clicking a player in the left turn-order panel. The active player is the player whose turn is currently being resolved.

## Cards

Cards display:

- Tier and cost chips at the top.
- Requirements below the title.
- Tags in the body.
- Manual action production at the bottom.

Requirements currently support display only. Enforcement will be added as the engine matures.

## Turn Actions

During a player's turn, they may take any number of free actions, then exactly one turn-ending action.

Free actions:

- Exhaust a ready card in the capital city to execute a `manual_action` logic node. In v0 this usually marks the card exhausted and adds volatile mana to the active player's pool.
- Assign volatile mana from the active player's pool onto a project.

Turn-ending actions:

- Propose a project by moving one card from hand into the project zone. If the project zone is full, the oldest project is discarded.
- Pass.

After proposing or passing, the active player's volatile mana pool is emptied and active player advances to the next non-passed player in turn order.

The Administration phase ends when all players consecutively pass.

## Mana And Projects

Mana tokens are volatile and are stored on player boards only during that player's current turn.

Players can assign stored mana tokens to projects through backend action endpoints. Projects do not build immediately. During Decay, completed projects are moved onto the capital city board.

During Decay:

- Completed projects are built into the capital city.
- All unfinished project contributions are wiped to zero.
- All exhausted cards refresh.

Newly built cards are ready after Decay.

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

The admin console exposes deck creation, modification, and deletion alongside the other catalog pages.

Cards can also be configured with `logic_nodes` from the guided card editor. The existing cost and exhaust controls are still available for simple cards.
