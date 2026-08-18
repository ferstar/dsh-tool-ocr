/**
 * Client bundle for the browser half: a closure-factory artifact the web
 * module system loads — the same format the harness's clientBundle preset
 * emits (window.__ModuleLoader__.load({id, factory}) with externals resolved
 * through the injected require). The preset is not published, so this
 * out-of-tree package reproduces it.
 */

const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** The runtime snapshot-store engine, resolved from the loader module table. */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

const EXTERNALS = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

export default {
  name: 'dsh-tool-ocr/client',
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  noExternal: (id: string) => (EXTERNALS.includes(id) ? undefined : true),
  plugins: [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (EXTERNALS.includes(source)) return null
      throw new Error(
        'client bundle purity: "' + source + '" is not a platform module — cross-plugin value imports are forbidden',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-tool-ocr", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
