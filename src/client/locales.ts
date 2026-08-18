/**
 * Copy dictionaries for the ocr configuration card, keyed by the
 * `settings.toolOcr` locale namespace (see the LocaleNamespaceMap merge in
 * index.ts). The t seat resolves keys through this namespace, then the
 * shared common vocabulary.
 */

/** Every dictionary key the ocr card renders. */
export type OcrCardKey =
  | 'title'
  | 'description'
  | 'command'
  | 'commandHint'
  | 'language'
  | 'detModel'
  | 'modelsDir'
  | 'maxTextChars'
  | 'timeoutMs'
  | 'maxImageBytes'
  | 'maxOutputBytes'
  | 'overridden'
  | 'reset'
  | 'save'
  | 'discard'
  | 'invalidNumber'
  | 'saveFailed'

export const en: Record<OcrCardKey, string> = {
  title: 'OCR',
  description: 'Local image text recognition (newbee-ocr over PP-OCRv6).',
  command: 'Engine command',
  commandHint: 'The nbocr executable: absolute path or a PATH-resolved name.',
  language: 'Recognition language',
  detModel: 'Detection model tier',
  modelsDir: 'Models directory',
  maxTextChars: 'Max recognized text characters',
  timeoutMs: 'Recognition timeout (ms)',
  maxImageBytes: 'Max image bytes',
  maxOutputBytes: 'Max engine output bytes',
  overridden: 'Overridden',
  reset: 'Reset',
  save: 'Save',
  discard: 'Discard',
  invalidNumber: 'Enter a whole number',
  saveFailed: 'The host refused the save; correct the highlighted fields and try again.',
}

export const zh: Record<OcrCardKey, string> = {
  "title": "OCR",
  "description": "本地图片文字识别（newbee-ocr，PP-OCRv6 模型）。",
  "command": "引擎命令",
  "commandHint": "nbocr 可执行文件：绝对路径或 PATH 可解析的名称。",
  "language": "识别语言",
  "detModel": "检测模型档位",
  "modelsDir": "模型目录",
  "maxTextChars": "最大识别文本字符数",
  "timeoutMs": "识别超时（毫秒）",
  "maxImageBytes": "最大图片字节数",
  "maxOutputBytes": "最大引擎输出字节数",
  "overridden": "已覆盖",
  "reset": "重置",
  "save": "保存",
  "discard": "放弃",
  "invalidNumber": "请输入整数",
  "saveFailed": "宿主拒绝了本次保存；请修正标红的字段后重试。"
}
