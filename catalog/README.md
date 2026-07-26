# Catalog Templates

This folder stores human-readable catalog setup files for Chronicle of the Fall.

The backend does not seed default game items from Python. A new database starts with an empty game catalog. Admins can import one of these JSON files from the admin console with `Import All` or import per-page files with `Import Page`.

Use this folder for default cards, tags/resources, images, Empire decks, Crisis
decks, Events, Ministries, Pillars, effect icons, agendas, groups, categories, and
Levels.

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
      "category": "volatile",
      "summary": "Transient construction and workforce resource.",
      "color": "#b45309",
      "data": {
        "resource_type": "volatile"
      }
    }
  ]
}
```

For a per-page file, set `kind` to a catalog kind such as `cards`, `tags`,
`images`, `events`, `empire-decks`, or `event-decks`.

Deck entries store repeated item ids in `data.item_ids`:

- `empire-decks` can be selected as the Empire Deck or the Base Card Pool.
- The Base Card Pool deals three cards to each player during setup.
- The Empire Deck deals two cards to each player and can contain Buildings,
  Cities, Events, and Political cards.
- `event-decks` are Crisis Decks resolved from Era 2 onward.
