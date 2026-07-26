# Game Asset Naming

These files are immutable frontend assets referenced by the repository-owned
catalogs in `catalog/ingredients/`.

Use lowercase kebab-case filenames and keep the catalog id in the filename:

- `tags/tag-<tag-id>.png`
- `resources/resource-<resource-id>.png`
- `pillars/<pillar-id>.png`
- `ministries/minister-<ministry-id>.png`
- `effects/<effect-id>.png`

The JSON entry in `catalog/ingredients/images.json` is authoritative. Its
`data.src` must use a frontend-root URL such as:

```json
{
  "id": "tag-military",
  "data": {
    "src": "/game-assets/tags/tag-military.png"
  }
}
```

To add or replace an asset:

1. Put the image at the exact path declared by the image catalog.
2. Add or update its `images.json` entry.
3. Reference that image id from a tag, Pillar, Ministry, or effect icon with
   `data.icon_image_id`.
4. Run `git add frontend/public/game-assets catalog/ingredients`.
5. Run `git lfs ls-files` and verify the raster appears in the output.

PNG and other raster formats in this folder are tracked by Git LFS. SVG files
remain normal Git text files.
