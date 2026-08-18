# dsh-tool-ocr

English | [中文](README.zh.md)

Local image text recognition for DeepSeek Harness models **without vision input**, backed by the standalone [newbee-ocr](https://github.com/zibo-chen/newbee-ocr-cli) (`nbocr`) engine over PP-OCRv6 models. Fully out-of-tree: depends only on published dsh base packages.

## Features

| Item | Description |
|---|---|
| `ocr` tool | `recognize` / `status` / `install` / `check` actions |
| Image inputs | Local `path`, or `attachment_id` (an image already in the conversation) |
| Output | Reading-ordered text, per-block bounding boxes, review flags (low confidence / amounts / numbers / dates / quantities), heuristic Markdown tables |
| Robustness | Survives MNN diagnostics in engine stdout; honors cancellation and timeout |
| Settings card | On dsh ≥ 0.1.0-rc.7 the plugin registers the `tool-ocr` namespace: the web **Settings → Plugins** page renders a card that edits the engine command, model tier, and run bounds live — no composition edit needed |

## Quick start

**1. Install the engine** — grab `nbocr` from the [newbee-ocr-cli releases](https://github.com/zibo-chen/newbee-ocr-cli/releases) (one-line installer or prebuilt archive):

```bash
curl -LsSf https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.sh | sh
# Windows PowerShell: irm https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.ps1 | iex
```

**2. Install the plugin**

```bash
dsh plugin --profile web add dsh-tool-ocr
# or: cd ~/.dsh/profiles/web && pnpm add dsh-tool-ocr
```

**3. Mount it** in your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: ocr
      name: 'dsh-tool-ocr'
      inject: [tools, subprocess, systemPrompt]
      config:
        command: 'C:/path/to/nbocr.exe'   # required — the nbocr executable
```

That's it — restart dsh, then point the model at an image: `ocr { path: "C:/screenshot.png" }`. To tune recognition (language, model tier, limits), open **Settings → Plugins → Plugin config** and edit the OCR card; changes apply on save, no restart needed. `command` is the only field that must come from the composition.

## Image inputs

- **`path`** works on every dsh build: the model reads the file from disk.
- **`attachment_id`** needs a build that admits images for text-only models (e.g. the [dsh fork](https://github.com/ferstar/deepseek-harness) with `api-gateway.allowImagePlaceholder: true`): images enter the session, the llm layer substitutes `[image attachment <id>]` text, and the model hands the id to `ocr`.

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

`status` probes readiness without engine work; `check` runs a real end-to-end 1x1 probe.

## Development

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm lint        # oxlint
```

Real-engine smoke (skipped unless both env vars are set):

```bash
NBOCR_BIN=/path/to/nbocr OCR_E2E_IMAGE=/path/to/image.png pnpm test
```

## License

MIT
