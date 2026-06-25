# Catalog Templates

This folder stores human-readable catalog setup files for Chronicle of the Fall.

The backend does not seed default game items from Python. A new database starts with an empty game catalog. Admins can import one of these JSON files from the admin console with `Import All` or import per-page files with `Import Page`.

Use this folder for new default cards, tags, decks, events, roles, agendas, groups, and card categories.

Expected JSON shape:

```json
{
  "version": 1,
  "kind": "all",
  "entries": [
    {
      "id": "labor",
      "name": "Labor",
      "kind": "tags",
      "category": "mana",
      "summary": "Transient construction and workforce resource.",
      "color": "#b45309",
      "data": {}
    }
  ]
}
```

For a per-page file, set `kind` to a catalog kind such as `cards`, `tags`, `events`, or `decks`.

Deck entries use `data.deck_type` to define their gameplay purpose:

- `cards`: player draw deck.
- `events`: event deck.
- `common-pool`: shared cards available for project proposals.
