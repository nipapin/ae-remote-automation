# AE Remote Automation

Express app that queues After Effects renders from a web form.

## Setup

1. Install dependencies:

```bash
npm install
```

2. In After Effects enable scripting: **Edit → Preferences → Scripting & Expressions** → enable **Allow Scripts to Write Files and Access Network**.

3. Set the After Effects path in `config.json` if needed:

```json
{
  "aePath": "C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe",
  "noui": false,
  "forceRestartAe": true,
  "port": 3000
}
```

- `forceRestartAe` — if After Effects is already open, it is closed and restarted so `-r` can run the queue script.
- `noui` — headless mode (`true` = no UI).

4. Start the server:

```bash
npm start
```

5. Open http://localhost:3000

## Test template (rainbow)

Your composition **Main** is wired in [`templates/rainbow/manifest.json`](templates/rainbow/manifest.json):

| Field | Layer |
|-------|-------|
| Top text | `top_text` |
| Main text | `main_text` |
| Bottom text | `bottom_text` |
| Background color | `bg` (shape) |
| Main box color | `main_text_bg` (shape) |

Save the project as:

```
templates/rainbow/template.aep
```

Point After Effects expressions / your AE JSON reader at:

```
templates/rainbow/params.json
```

The web form edits this file and then asks AE for a PNG preview at **1 second** of composition **Main**.

## Flow

1. Choose a template and fill text / color / image fields
2. Submit — the job is written to `data/queue.json`
3. The server launches After Effects with `scripts/process-job.jsx`
4. The script processes the latest queued job and renders video
5. The page polls status and shows the result in a `<video>` player

## Templates

See [templates/README.md](templates/README.md) for adding Envato / custom `.aep` templates.
