# Chronicle of the Fall: Goldfishing Rules v0

This document tracks the playable rules implemented in the prototype. It is the development reference for current behavior, not the final board-game rulebook.

## Mode

Goldfishing mode is a four-player solo simulation of the empire engine.

Version 0 intentionally excludes hidden agendas, founding new cities, full event resolution, and multiplayer permissions. All game mutations are executed by the backend; the frontend only displays state and sends action requests.

## Setup

1. The backend creates a room in `chronicle_solo` mode.
2. The player chooses an Empire deck and Event deck when starting a room. If no Empire deck exists, the backend falls back to available catalog cards. The Event deck may be empty.
3. One capital city is created and its capital foundation card is placed in play.
4. Four players are created in fixed turn order.
5. Each player draws three cards from the selected card deck.
6. Player 1 becomes active and starts as Minister of the Empire.

Events are loaded into an event deck. The first epoch starts directly in Administration; later epochs enter Council, reveal one event if available, rotate the Minister of the Empire, select ministries, and draw one card per player.

## Board Zones

The central board shows the capital city. City cards are grouped by card category, such as foundation, institution, or route.

The project zone can hold up to three projects. A project is a card from a player's hand or the common pool that is waiting for its cost to be paid, then built into an eligible city zone.

The common pool is a shared set of cards loaded from the latest deck whose `deck_type` is `common-pool`. Cards in the common pool are shown next to the focused player's hand and can be proposed by the active player.

The focused player board appears at the bottom of the screen. The focused player can be changed by clicking a player in the left turn-order panel. The active player is the player whose turn is currently being resolved.

## Cards

Cards display:

- Tier and cost chips at the top.
- Requirements below the title.
- Counted permanent tags in the body.
- Manual action production at the bottom.

Building cards can define counted permanent tags, volatile resource costs, required city tags, pitch tags, and stackable exhaust effects. Exhaust effects currently support producing volatile resources and drawing cards. Requirements are enforced when a completed project is built. A completed project only shows build options in city zones where its requirements are satisfied.

## Turn Actions

Each epoch moves through explicit phases tracked by the backend and shown by the UI:

1. Council: rotate the Minister of the Empire, select ministries, reveal one event if the event deck is not empty, and draw one card per player.
2. Administration: players act in turn order, starting from the Minister of the Empire.
3. Crisis: event cards are visual only and have no effects in v0.
4. Decay cleanup: unfinished contributions are wiped, completed unbuilt projects remain available, exhausted cards refresh, and volatile mana is cleared.

## Turn Actions

During a player's Administration turn, the backend returns every legal action for the UI to render.

Limited action:

- Exhaust a ready card in the capital city to execute a manual logic node whose preconditions include `exhaust`. Exhausting is a built-in cost, not an explicit effect. This can be performed at most once per player turn and does not end the turn.

Free actions:

- Assign volatile mana from the active player's pool onto a project.
- Build a completed project into an eligible city zone. This is available to the Minister of the Empire and any ministry configured with `can_finalize_projects`. The backend returns one build action per valid target, and the UI shows those targets as semi-transparent build options in the matching zones.
- Use a configured ministry resource action, such as the Minister of Infrastructure producing an admin-selected volatile resource. This is once per year for that ministry action.

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

- `manual_action`: a player-triggered action.
- `persistent`: a passive effect marker. Persistent effects are stored in catalog data but are not yet resolved by v0 runtime logic.

Supported v0 preconditions:

- `exhaust`: if true, the card must be ready and becomes exhausted as the action cost.
- `empire_tags`: a repeated list of permanent tag ids required across the empire. Multiple copies mean multiple required instances.

```json
{
  "exhaust": true,
  "empire_tags": ["industry", "industry", "food"]
}
```

Supported v0 effect types:

- `draw_card`, used for drawing from the Empire deck into the active player's hand.
- `add_resources`, used for adding volatile resources to the active player's pool. Resources are stored as a repeated list of resource tag ids.
- `ready_building`, which removes exhaustion from the acting building.

Cards must define manual actions with `logic_nodes`; shortcut `exhaust` metadata is not supported in the clean catalog schema.

## Admin Catalog

Decks are catalog entries with kind `decks`.

The backend does not create default game items from Python. A new database starts with an empty catalog. Reusable defaults and templates live under `catalog/` as JSON files and are loaded through the admin console import controls.

An Empire deck uses:

```json
{
  "deck_type": "empire",
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

Tags can be marked as permanent tags or volatile resources. Cards can be configured with counted permanent tags, volatile costs, required city tags, pitch tags, and `logic_nodes` from the guided card editor.

Ministries are catalog entries with configurable event-type jurisdictions. The Minister of Infrastructure-style resource list is admin-editable through `infrastructure_resources`, stored as a list of volatile resource tag ids; project finalization and Politics/Economy proposal permissions are also ministry metadata.
