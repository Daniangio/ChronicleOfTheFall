# Curated Content

These files are a reviewable starter catalog chosen by the game administrator.
They are source-controlled templates, not live application storage.

| File | Admin catalog | Depends on |
| --- | --- | --- |
| `cards.json` | City and Structure cards | repository ingredients |
| `events.json` | Edicts and Crises | repository ingredients |
| `agendas.json` | complete Hidden Agendas | repository ingredients |
| `decks.json` | Empire and Crisis decks | cards and events |
| `levels.json` | playable Levels | City cards and decks |

Each file can be uploaded from its matching admin page. Alternatively, upload
`../chronicle-catalog-all.json` from any dynamic catalog page to import the full
starter set in dependency order.

After editing one of these files, rebuild the combined bundle:

```bash
python scripts/build_catalog_bundle.py
```

The bundle builder validates the envelope and checks that every entry has the
same `kind` as its source file.
