# Templates

Each template lives in its own folder under `templates/<id>/` and must include a `manifest.json`.

## Demo template

`templates/demo/` uses `mode: "generate"`. After Effects builds a simple comp at render time — no `.aep` file is required.

## Envato / custom `.aep` templates

1. Create a folder, for example `templates/my-intro/`.
2. Copy your `.aep` file into that folder, e.g. `template.aep`.
3. Add `manifest.json`:

```json
{
  "id": "my-intro",
  "name": "My Intro",
  "mode": "aep",
  "aep": "template.aep",
  "comp": "Main Comp",
  "fields": [
    { "id": "title", "type": "text", "label": "Title", "layer": "Title" },
    { "id": "color", "type": "color", "label": "Accent", "layer": "BG", "target": "solid" },
    { "id": "logo", "type": "image", "label": "Logo", "layer": "Logo" }
  ]
}
```

## How to find layer and comp names in After Effects

1. Open the project in After Effects.
2. The composition name is shown in the Project panel — use it for `"comp"`.
3. Layer names are shown in the Timeline panel — use them for `"layer"` in each field.
4. For text fields, the script updates the **Source Text** property.
5. For color fields, the script updates a **Solid** color or a **Fill** effect if present.
6. For image fields, the script imports the uploaded file and replaces the layer source.

## Field types

| type   | description                          |
|--------|--------------------------------------|
| `text` | Updates text layer Source Text       |
| `color`| Hex color, e.g. `#4f46e5`              |
| `image`| Uploaded image replaces layer source |

After adding a template, restart the server or refresh the page — templates are loaded from disk automatically.
