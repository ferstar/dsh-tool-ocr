# dsh-tool-ocr

[English](README.md) | 中文

一个独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：为**不支持视觉输入**的模型（如 DeepSeek 对话模型）提供本地图片文字识别，基于独立的 [newbee-ocr](https://github.com/zibo-chen/rust-paddle-ocr)（`nbocr`）引擎，运行 PP-OCRv6 模型。

完全独立于仓库（out-of-tree）：只依赖已发布的 dsh 基础包（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-subprocess` 等），与 deepseek-harness 仓库零耦合。

## 功能

| 项 | 说明 |
|---|---|
| `ocr` 工具 | 模型可见工具：`recognize` / `status` / `install`（check 的别名）/ `check` 四种动作 |
| 图片输入 | 本地 `path`（按会话工作目录解析）或 `attachment_id`（会话中已附加的图片，物化为临时文件） |
| 输出 | 阅读顺序 `<text>`、引擎事实、分块包围盒（`include_boxes`）、复核标记（低置信度/金额/数字/日期/数量，`needsReview`）、启发式 Markdown 表格（`table`） |
| 健壮性 | 能容忍 MNN 诊断信息污染引擎 stdout；遵循调用方取消和超时 |

## 安装

前置条件：已构建的 `nbocr` 二进制。

```bash
# 构建引擎（在 newbee-ocr-cli 仓库中）
cargo build --release        # -> target/release/nbocr[.exe]

# 本插件：安装依赖并构建
pnpm install && pnpm build
```

## 挂载到 dsh

在 profile 的 `cordis.patch.yml` 中添加插件行（或使用 `dsh plugin --profile <name> add` 安装已发布的包）：

```yaml
- insert:
    - id: ocr
      name: 'dsh-tool-ocr'
      inject: [tools, subprocess, systemPrompt]
      config:
        # nbocr 可执行文件：绝对路径，或 PATH 上可解析的名称
        command: 'C:/path/to/nbocr.exe'
        # 识别模型/语言别名
        language: 'chinese'
        # 检测模型档位：v6-tiny（内嵌默认）、v6-small、v6-medium
        detModel: 'v6-tiny'
```

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `command` | —（必填） | nbocr 可执行文件：绝对路径或 PATH 上的名称。 |
| `args` | `[]` | nbocr 子命令之前的额外参数（不走 shell）。 |
| `env` | `{}` | 额外的环境变量项。 |
| `language` | `chinese` | 识别模型/语言别名。 |
| `detModel` | `v6-tiny` | 检测模型档位。 |
| `modelsDir` | `''` | 非内嵌模型目录；为空使用内嵌模型。 |
| `maxImageBytes` | `26214400` | 接受的最大图片字节数。 |
| `maxOutputBytes` | `2000000` | 收集的引擎 stdout 上限（字节）。 |
| `maxTextChars` | `12000` | `text` 中返回的最大识别文本字符数。 |
| `timeoutMs` | `600000` | 工具调用超时预算（毫秒）。 |

## 工具用法

```
ocr { path | attachment_id, action?, include_boxes?, table?, max_text_chars? }
```

模型应使用 `ocr` 并传入图片文件的 `path`，或当会话中已包含图片（显示为 `[image attachment <id>]`）时传入 `attachment_id`。`status` 探测就绪状态而不做引擎工作；`check` 端到端运行一次真实的 1x1 探针识别。

## 开发

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest（单元测试 + fixture 模拟引擎）
pnpm lint        # oxlint
```

真实引擎冒烟测试（未设置两个环境变量时跳过）：

```bash
NBOCR_BIN=/path/to/nbocr OCR_E2E_IMAGE=/path/to/image.png pnpm test
```

## License

MIT
