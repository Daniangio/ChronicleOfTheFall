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

The project zone can hold up to three projects. A project is a card from a player's hand that is waiting for its cost to be paid.

The focused player board appears at the bottom of the screen. The focused player can be changed by clicking a player in the left turn-order panel. The active player is the player whose turn is currently being resolved.

## Cards

Cards display:

- Tier and cost chips at the top.
- Requirements below the title.
- Tags in the body.
- Exhaust production at the bottom.

Requirements currently support display only. Enforcement will be added as the engine matures.

## Turn Actions

The active player can take one of these actions:

1. Place one card from hand into the project zone, if there is an empty project slot.
2. Exhaust one non-exhausted card in the capital city to add its produced mana tokens to that player's pool.
3. Pass.

After placing a project, exhausting a card, or passing, active player advances to the next non-passed player in turn order.

## Mana And Projects

Mana tokens are stored on player boards.

Players can assign stored mana tokens to projects through backend action endpoints. When a project has received all required mana, it completes immediately and the card is placed into the capital city.

Newly built cards are not exhausted by default, so they are available for a later player action.

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
