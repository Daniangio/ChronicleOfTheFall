# Catalogs

Catalog ownership is split between repository ingredients, curated import
templates, and live database content. Repository JSON files are never implicit
exports of the development database.

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

## Curated Dynamic Content

`catalog/content/` contains the versioned starter set for content that remains
admin-authored:

- `cards.json`
- `events.json`
- `agendas.json`
- `decks.json`
- `levels.json`

Import the files in dependency order:

1. `cards.json`
2. `events.json`
3. `agendas.json`
4. `decks.json`
5. `levels.json`

`chronicle-catalog-all.json` is the same dynamic template as a single convenience
import. Rebuild it after changing a content file:

```bash
python scripts/build_catalog_bundle.py
```

All files use this envelope:

```json
{
  "version": 1,
  "kind": "cards",
  "entries": []
}
```

Importing copies these entries into PostgreSQL. Subsequent admin changes modify
PostgreSQL only; they do not rewrite these files. `Export All` downloads the
current dynamic database content and can be reviewed before replacing the
curated starter set.

See [catalog_data_storage.md](../documentation/catalog_data_storage.md) for the
complete repository, PostgreSQL, Redis, Docker volume, and reset model.
