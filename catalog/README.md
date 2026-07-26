# Catalogs

Catalog ownership is split between repository ingredients and database content.

## Repository Ingredients

`catalog/ingredients/` is authoritative for:

- `tags.json`: permanent tags and volatile resources
- `images.json`: stable image ids and frontend public paths
- `pillars.json`: Pillar definitions
- `tokens.json`: fixed City token definitions
- `ministries.json`: Ministry definitions
- `effect-icons.json`: supported effect codes and their image references

The backend synchronizes these files into the database at startup and whenever a
static catalog is read. Entries removed from these files are removed from the
database. Their admin pages are inspection-only.

To change an ingredient, edit its JSON file in Git. Do not use an admin import.
Raster assets live under `frontend/public/game-assets/`; naming and replacement
instructions are in `frontend/public/game-assets/README.md`.

## Dynamic Content

`catalog/content/` contains optional import templates for content that remains
admin-authored:

- cards
- Events
- unified Empire decks
- Levels

Import the files in dependency order:

1. `cards.json`
2. `events.json`
3. `decks.json`
4. `levels.json`

`chronicle-catalog-all.json` is the same dynamic template as a single convenience
import. It intentionally excludes repository ingredients, agendas, and groups
when no defaults for those kinds exist.

All files use this envelope:

```json
{
  "version": 1,
  "kind": "cards",
  "entries": []
}
```

An admin `Export All` contains only dynamic content. Static ingredients remain
portable because they are versioned with the application.
