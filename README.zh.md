# dsh-tool-ocr

[English](README.md) | 中文

为 DeepSeek Harness 中**不支持视觉输入**的模型（如 DeepSeek 对话模型）提供本地图片文字识别，基于独立的 [newbee-ocr](https://github.com/zibo-chen/newbee-ocr-cli)（`nbocr`）引擎，运行 PP-OCRv6 模型。完全独立于仓库（out-of-tree）：只依赖已发布的 dsh 基础包。

## 功能

| 项 | 说明 |
|---|---|
| `ocr` 工具 | `recognize` / `status` / `install` / `check` 四种动作 |
| 图片输入 | 本地 `path`，或 `attachment_id`（会话中已附加的图片） |
| 输出 | 阅读顺序文本、分块包围盒、复核标记（低置信度/金额/数字/日期/数量）、启发式 Markdown 表格 |
| 健壮性 | 能容忍 MNN 诊断信息污染引擎 stdout；遵循调用方取消和超时 |
| 配置卡片 | 在 dsh ≥ 0.1.0-rc.7 上运行时，插件注册 `tool-ocr` 命名空间：Web 的 **设置 → 插件** 页面渲染一张卡片，可实时修改引擎命令、模型档位与运行边界——无需再改组合配置 |

## 快速开始

**1. 安装引擎** —— 从 [newbee-ocr-cli Releases](https://github.com/zibo-chen/newbee-ocr-cli/releases) 获取 `nbocr`（一键安装脚本或预构建压缩包）：

```bash
curl -LsSf https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.sh | sh
# Windows PowerShell: irm https://github.com/zibo-chen/newbee-ocr-cli/releases/latest/download/newbee_ocr_cli-installer.ps1 | iex
```

**2. 安装插件**

```bash
dsh plugin --profile web add dsh-tool-ocr
# 或在 profile 目录内：cd ~/.dsh/profiles/web && pnpm add dsh-tool-ocr
```

**3. 挂载** —— 在 profile 的 `cordis.patch.yml` 中添加：

```yaml
- insert:
    - id: ocr
      name: 'dsh-tool-ocr'
      inject: [tools, subprocess, systemPrompt]
      config:
        command: 'C:/path/to/nbocr.exe'   # 必填——nbocr 可执行文件
```

完成。重启 dsh 后，让模型识别图片：`ocr { path: "C:/screenshot.png" }`。需要调整识别参数（语言、模型档位、各项上限）时，打开 **设置 → 插件 → 插件配置** 编辑 OCR 卡片，保存即生效、无需重启。只有 `command` 必须写在组合配置里。

## 图片输入

- **`path`** 在所有 dsh 构建上可用：模型直接从磁盘读取文件。
- **`attachment_id`** 需要允许纯文本模型接收图片的构建（例如开启 `api-gateway.allowImagePlaceholder: true` 的 [dsh fork](https://github.com/ferstar/deepseek-harness)）：图片进入会话，llm 层替换为 `[image attachment <id>]` 文本，模型再把 id 交给 `ocr`。

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

`status` 探测就绪状态而不做引擎工作；`check` 端到端运行一次真实的 1x1 探针识别。

## 开发

```bash
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm lint        # oxlint
```

真实引擎冒烟测试（未设置两个环境变量时跳过）：

```bash
NBOCR_BIN=/path/to/nbocr OCR_E2E_IMAGE=/path/to/image.png pnpm test
```

## License

MIT
