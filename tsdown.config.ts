// dsh-wallpaper build: the node half bundles to lib/index.js (ESM, externals
// resolved from the app's own @deepseek-ai packages), and the browser half to
// lib/client.js (a closure-factory bundle that registers itself with the web
// shell's module loader and resolves externals through the loader module
// table — react / react-dom / cordis / the platform modules).
//
// The file deliberately does not import from 'tsdown' so it can run with the
// harness checkout's tsdown binary without a local install step; the config
// shape mirrors the harness's packages/client/tsdown.client.ts preset.

/** Platform modules the web shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** Documented loader-table exemption (the runtime store engine). */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

const CLIENT_EXTERNALS = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

const PACKAGE_ID = 'dsh-wallpaper'

export default [
  // Node half (host process).
  {
    name: PACKAGE_ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    // Respect package.json "type": "module" so the ESM artifact is index.js
    // (the "main" field) rather than index.mjs.
    fixedExtension: false,
    clean: false,
  },
  // Browser half (client plugin bundle).
  {
    name: `${PACKAGE_ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (id) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
]
