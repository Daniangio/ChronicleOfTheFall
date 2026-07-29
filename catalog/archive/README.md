# Archived Catalogs

Files in this directory are retained for design reference only. They are not
part of the curated starter content and are not included by
`scripts/build_catalog_bundle.py`.

`legacy-crisis-events.json` uses the removed `data.crisis_check` model. The
current engine resolves Crisis cards through `requirements`, `main_effects`, and
`alternative_effects`; importing the archived file would preserve fields that
the engine does not evaluate.
