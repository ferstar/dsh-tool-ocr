# dsh-tool-ocr

[English](README.md) | 中文

一个独立的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：为**不支持视觉输入**的模型（如 DeepSeek 对话模型）提供本地图片文字识别，基于独立的 [newbee-ocr](https://github.com/zibo-chen/newbee-ocr-cli)（`nbocr`）引擎，运行 PP-OCRv6 模型。

完全独立于仓库（out-of-tree）：只依赖已发布的 dsh 基础包（`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-subprocess` 等），与 deepseek-harness 仓库零耦合。

## 功能

| 项 | 说明 |
|---|---|
| `ocr` 工具 | 模型可见工具：`recognize` / `status` / `install`（check 的别名）/ `check` 四种动作 |
| 图片输入 | 本地 `path`（按会话工作目录解析）或 `attachment_id`（会话中已附加的图片，物化为临时文件） |
| 输出 | 阅读顺序 `<text>`、引擎事实、分块包围盒（`include_boxes`）、复核标记（低置信度/金额/数字/日期/数量，`needsReview`）、启发式 Markdown 表格（`table`） |
| 健壮性 | 能容忍 MNN 诊断信息污染引擎 stdout；遵循调用方取消和超时 |
| 配置页面 | 在 dsh ≥ 0.1.0-rc.7 上运行时，插件注册 `tool-ocr` settings 命名空间：Web 的 **设置 → 插件** 页面会渲染一张卡片，可实时修改引擎命令、模型档位与运行边界——无需再改组合配置 |

## 两种使用方式

取决于你运行的是哪个 dsh 构建，图片输入的工作方式不同：

### 方式 A —— 官方 dsh：传图片路径（`ocr { path }`）

官方 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 会拒绝未声明图片输入能力的模型（如 DeepSeek 对话模型）上传图片 —— `session.prompt` 返回 `MODEL_DOES_NOT_SUPPORT_IMAGES`。这是产品决策而非缺陷，本插件无法绕过。因此在官方 dsh 上，通过路径使用工具：

```
ocr { path: "C:/Users/me/Desktop/screenshot.png" }
```

模型通过 OCR 引擎从磁盘读取文件。图片从不进入会话，因此无需改动 dsh 核心。

### 方式 B —— [dsh fork](https://github.com/ferstar/deepseek-harness)：拖拽图片（`ocr { attachment_id }`）

[ferstar/deepseek-harness](https://github.com/ferstar/deepseek-harness)（默认分支 `feat/image-placeholder-for-text-only-adapters`）增加了一条可选的图片占位管线：

- `api-gateway` 新增 `allowImagePlaceholder`（默认 `false`）。开启后，即使纯文本模型也允许图片进入会话。
- 请求到达 LLM 之前，每个 image block 都会被替换为 `[image attachment <id>]` 文本。模型知道图片存在，调用 `ocr { attachment_id }`，插件把附件物化为临时文件交给引擎。

体验与多模态模型一致：把图片拖进对话，模型就能读出其中的文字 —— 区别只是图片在发给 LLM 之前先交给了 OCR，而不是作为像素发送。

在 profile 的 `cordis.patch.yml` 中开启：

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

## 安装

### 1. 安装 OCR 引擎

从 [newbee-ocr-cli](https://github.com/zibo-chen/newbee-ocr-cli) 的 Releases 获取 `nbocr` 二进制（提供 Windows / macOS / Linux 预构建版本）：

```bash
# 一键安装脚本（自动检测平台，安装到 ~/.cargo/bin 并加入 PATH）
curl -LsSf https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.sh | sh
# 或在 Windows PowerShell 中：
#   irm https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.ps1 | iex

# 备选：从 Release 页面下载对应平台的压缩包，解压出 nbocr[.exe] 放到任意目录，
# 然后在配置里用 `command` 指向它
```

或从源码构建：

```bash
git clone https://github.com/zibo-chen/newbee-ocr-cli
cd newbee-ocr-cli && cargo build --release   # -> target/release/nbocr[.exe]
```

### 2. 将插件安装到你的 dsh profile

从 npm 安装（已发布为 `dsh-tool-ocr`）：

```bash
dsh plugin --profile web add dsh-tool-ocr
# 或在 profile 目录内：
cd ~/.dsh/profiles/web && pnpm add dsh-tool-ocr
```

或从源码安装：

```bash
git clone https://github.com/ferstar/dsh-tool-ocr
cd dsh-tool-ocr && pnpm install && pnpm build
```

## 挂载到 dsh

在 profile 的 `cordis.patch.yml` 中添加插件行：

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

> 注意：`dsh-tool-ocr` 是普通插件而非 bundle —— `dsh plugin add` 会将其安装为依赖，但不会自动挂载。上面的 patch 行才是激活它的方式。

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