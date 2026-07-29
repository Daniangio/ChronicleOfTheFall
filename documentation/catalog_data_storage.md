# Catalog Data and Storage

The project has three deliberately separate data layers.

## JSON Envelope

Every catalog file and admin export uses the same outer shape:

```json
{
  "version": 1,
  "kind": "cards",
  "catalog_kinds": ["cards"],
  "entries": []
}
```

`kind` is one catalog kind for a page-specific file or `all` for a combined
bundle. `catalog_kinds` documents the kinds included in the file. Each entry is:

```json
{
  "id": "granary",
  "kind": "cards",
  "name": "Granary",
  "category": "structure",
  "summary": "Stores the harvest.",
  "color": null,
  "data": {}
}
```

The top-level fields are shared. `data` is kind-specific:

| Kind | Important `data` fields |
| --- | --- |
| `tags` | `resource_type`, `icon_image_id` |
| `images` | repository asset metadata such as `src` |
| `ministries` | fixed ability flags and `icon_image_id` |
| `pillars` | range, start value, effects, and `icon_image_id` |
| `tokens` | token definition and `icon_image_id` |
| `effect-icons` | `effect_type` and `icon_image_id` |
| `cards` | costs, required/provided tags, production, and card effects |
| `events` | Edict/Crisis requirements and effect lists |
| `agendas` | Primary, Secondary, Collapse, and Forbidden sections |
| `decks` | deck type, card copies, and initial setup tiers |
| `levels` | initial City, Empire deck, Crisis deck, and setup settings |

Catalog ids are globally unique across all kinds and are normalized to
lowercase kebab case during import. References in `data` use those stable ids.

## 1. Repository Ingredients

`catalog/ingredients/*.json` defines the fixed vocabulary implemented by the
code:

- tags and volatile resources;
- images and their public asset ids;
- Ministries, Pillars, and tokens;
- supported effect icons.

The backend synchronizes these files into PostgreSQL when the static catalog is
read. Their admin pages are inspection-only. Editing the database copy is not a
durable way to change an ingredient because the repository definition will win
on the next synchronization.

Image files live in `frontend/public/game-assets/`. The JSON files store stable
image ids and public paths; Git stores the actual assets.

## 2. Curated Dynamic Content

`catalog/content/*.json` is a source-controlled starter set selected by an
administrator:

- cards;
- Edicts and Crises;
- complete Hidden Agendas;
- Empire and Crisis decks;
- Levels.

These files are manually imported through the admin console. Importing creates
or updates PostgreSQL records. The application does not auto-import them and
admin edits do not write back to Git.

`catalog/chronicle-catalog-all.json` is a generated convenience bundle of those
same files. Build it with:

```bash
python scripts/build_catalog_bundle.py
```

Admin `Export All` is the inverse operation: it downloads the current dynamic
records from PostgreSQL. That download becomes repository content only after it
is deliberately reviewed and placed under `catalog/content/`.

`catalog/archive/` contains superseded exports retained only for design
reference. Archived files are not application defaults and are intentionally
excluded from the generated bundle.

## 3. Live Development Data

PostgreSQL is the authoritative live store for catalog entries, users, and
audit records. The `game_catalog_entries` table contains both synchronized
ingredients and imported/admin-authored dynamic content.

Redis stores active room and transient runtime state. It is not the catalog
source of truth.

Docker Compose persists these stores in named volumes:

| Compose volume | Container path | Purpose |
| --- | --- | --- |
| `postgres_data` | `/var/lib/postgresql/data` | PostgreSQL database |
| `redis_data` | `/data` | Redis runtime state |
| `redisinsight_data` | `/data` | optional RedisInsight settings |

Docker prefixes the real volume names with the Compose project name. List the
actual names with:

```bash
docker compose config --volumes
docker volume ls
```

The backend bind mount `.:/workspace` and frontend bind mount
`./frontend:/app` expose repository files inside development containers. A file
visible in a container through those mounts is still source code, not database
state.

## Inspecting Live Content

Adminer is available at the configured `ADMINER_PORT` when the development
stack is running. The same catalog counts can be inspected from the terminal:

```bash
docker compose exec postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select kind, count(*) from game_catalog_entries group by kind order by kind;"'
```

`docker compose down` removes containers but preserves named volumes and data.
To intentionally reset all local PostgreSQL and Redis data:

```bash
docker compose down -v
docker compose up -d
```

The `-v` operation is destructive. After a reset, fixed ingredients are
re-synchronized from Git; dynamic content remains empty until a curated catalog
is imported.
