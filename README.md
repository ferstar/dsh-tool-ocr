# dsh-tool-ocr

A standalone [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin: local image text recognition for models **without vision input** (e.g. DeepSeek chat models), backed by the standalone [newbee-ocr](https://github.com/zibo-chen/rust-paddle-ocr) (`nbocr`) engine over PP-OCRv6 models.

Fully out-of-tree: depends only on published dsh base packages (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-subprocess`, …). No coupling to the deepseek-harness repository.

## What it provides

| Item | Description |
|---|---|
| `ocr` tool | Model-facing tool: `recognize` / `status` / `install` (alias of check) / `check` actions |
| Image inputs | Local `path` (resolved against the session workspace) or `attachment_id` (image already attached to the conversation, materialized to a temp file) |
| Output | Reading-ordered `<text>`, engine facts, per-block bounding boxes (`include_boxes`), review flags (low-confidence / amount / numeric / date / quantity, `needsReview`), heuristic Markdown table (`table`) |
| Robustness | Survives MNN diagnostics polluting engine stdout; honors caller cancellation and timeout |

## Install

Prerequisites: a built `nbocr` binary.

```bash
# build the engine (from the newbee-ocr-cli repo)
cargo build --release        # -> target/release/nbocr[.exe]

# this plugin: install deps and build
pnpm install && pnpm build
```

## Mount into dsh

Add the plugin row to your profile's `cordis.patch.yml` (or use `dsh plugin --profile <name> add` with a published package):

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