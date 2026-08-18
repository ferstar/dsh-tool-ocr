# dsh-tool-ocr

English | [中文](README.zh.md)

A standalone [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin: local image text recognition for models **without vision input** (e.g. DeepSeek chat models), backed by the standalone [newbee-ocr](https://github.com/zibo-chen/newbee-ocr-cli) (`nbocr`) engine over PP-OCRv6 models.

Fully out-of-tree: depends only on published dsh base packages (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-subprocess`, …). No coupling to the deepseek-harness repository.

## What it provides

| Item | Description |
|---|---|
| `ocr` tool | Model-facing tool: `recognize` / `status` / `install` (alias of check) / `check` actions |
| Image inputs | Local `path` (resolved against the session workspace) or `attachment_id` (image already attached to the conversation, materialized to a temp file) |
| Output | Reading-ordered `<text>`, engine facts, per-block bounding boxes (`include_boxes`), review flags (low-confidence / amount / numeric / date / quantity, `needsReview`), heuristic Markdown table (`table`) |
| Robustness | Survives MNN diagnostics polluting engine stdout; honors caller cancellation and timeout |
| Configuration page | When run on dsh ≥ 0.1.0-rc.7, the plugin registers the `tool-ocr` settings namespace: the web **Settings → Plugins** page renders a card to edit the engine command, model tier, and run bounds live — no composition edit needed |

## Two ways to use it

Depending on which dsh build you run, image input works differently:

### Option A — official dsh: pass image paths (`ocr { path }`)

The official [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) rejects image uploads for models that do not declare image input (e.g. DeepSeek chat models) — `session.prompt` answers `MODEL_DOES_NOT_SUPPORT_IMAGES`. That is a product decision, not a bug, and this plugin cannot override it. So on an official dsh install you use the tool by path:

```
ocr { path: "C:/Users/me/Desktop/screenshot.png" }
```

The model reads the file from disk through the OCR engine. No image ever enters the session, so no dsh core change is needed.

### Option B — the [dsh fork](https://github.com/ferstar/deepseek-harness): drag-and-drop images (`ocr { attachment_id }`)

The fork at [ferstar/deepseek-harness](https://github.com/ferstar/deepseek-harness) (default branch `feat/image-placeholder-for-text-only-adapters`) adds an opt-in image-placeholder pipeline:

- `api-gateway` gains `allowImagePlaceholder` (default `false`). With it on, images are admitted into the session even for text-only models.
- Before the request reaches the LLM, every image block is substituted with `[image attachment <id>]` text. The model sees that an image exists, calls `ocr { attachment_id }`, and the plugin materializes the attachment to a temp file for the engine.

The experience is like a multimodal model: drag the image into the chat, and the model reads its text — the image is simply handed to OCR before the LLM instead of being sent as pixels.

Enable it in your profile's `cordis.patch.yml`:

```yaml
- id: api-gateway
  config:
    allowImagePlaceholder: true

- insert:
    - id: ocr
      name: 'dsh-tool-ocr'
      inject: [tools, subprocess, systemPrompt]
      config:
        command: 'C:/path/to/nbocr.exe'
        detModel: 'v6-tiny'
        language: 'chinese'
```

## Install

### 1. Install the OCR engine

Get the `nbocr` binary from the [newbee-ocr-cli](https://github.com/zibo-chen/newbee-ocr-cli) releases (prebuilt binaries for Windows / macOS / Linux):

```bash
# one-line installer (detects platform, installs to ~/.cargo/bin, adds to PATH)
curl -LsSf https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.sh | sh
# or on Windows PowerShell:
#   irm https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.ps1 | iex

# alternative: download the archive for your platform from the release page
#   and unpack nbocr[.exe] to any directory, then point `command` at it
```

Or build from source:

```bash
git clone https://github.com/zibo-chen/newbee-ocr-cli
cd newbee-ocr-cli && cargo build --release   # -> target/release/nbocr[.exe]
```

### 2. Install the plugin into your dsh profile

From npm (published as `dsh-tool-ocr`):

```bash
dsh plugin --profile web add dsh-tool-ocr
# or, inside the profile directory:
cd ~/.dsh/profiles/web && pnpm add dsh-tool-ocr
```

Or from source:

```bash
git clone https://github.com/ferstar/dsh-tool-ocr
cd dsh-tool-ocr && pnpm install && pnpm build
```

## Mount into dsh

Add the plugin row to your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: ocr
      name: 'dsh-tool-ocr'
      inject: [tools, subprocess, systemPrompt]
      config:
        # nbocr executable: absolute path, or a name resolved on PATH
        command: 'C:/path/to/nbocr.exe'
        # recognition model/language alias
        language: 'chinese'
        # detection model tier: v6-tiny (embedded default), v6-small, v6-medium
        detModel: 'v6-tiny'
```

> Note: `dsh-tool-ocr` is a plain plugin, not a bundle — `dsh plugin add` installs it as a
> dependency but does not auto-mount it. The patch row above is what activates it.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `command` | — (required) | The nbocr executable: absolute path or PATH-resolved name. |
| `args` | `[]` | Extra arguments before the nbocr subcommand (no shell). |
| `env` | `{}` | Extra environment entries. |
| `language` | `chinese` | Recognition model/language alias. |
| `detModel` | `v6-tiny` | Detection model tier. |
| `modelsDir` | `''` | Model directory for non-embedded models; empty uses embedded models. |
| `maxImageBytes` | `26214400` | Largest accepted image in bytes. |
| `maxOutputBytes` | `2000000` | Largest collected engine stdout in bytes. |
| `maxTextChars` | `12000` | Largest recognized text returned in `text`. |
| `timeoutMs` | `600000` | Tool-call timeout budget in ms. |

## Tool usage

```
ocr { path | attachment_id, action?, include_boxes?, table?, max_text_chars? }
```

The model should call `ocr` with `path` for image files, or with `attachment_id` when the conversation already contains an image (shown as `[image attachment <id>]`). `status` probes readiness without engine work; `check` runs a real 1x1 probe recognition end to end.

## Development

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest (unit + fixture-spawned engine)
pnpm lint        # oxlint
```

Real-engine smoke (skipped unless both env vars are set):

```bash
NBOCR_BIN=/path/to/nbocr OCR_E2E_IMAGE=/path/to/image.png pnpm test
```

## License

MIT