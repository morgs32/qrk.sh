import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig, type Plugin } from 'vitest/config';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function makeWorkerdVitestConfig(props: {
  packageRoot?: string;
  systemModulePath?: string;
  include?: readonly string[];
  passWithNoTests?: boolean;
  setupFiles?: readonly string[];
  workerBindings?: Readonly<Record<string, string | boolean>>;
  workerMainPath?: string;
  wranglerConfigPath?: string;
}) {
  const {
    include = ['src/**/*.workerd.spec.ts'],
    packageRoot = process.cwd(),
    passWithNoTests = true,
    setupFiles = [],
    wranglerConfigPath,
  } = props;
  const systemModulePath =
    props.systemModulePath ??
    process.env['ZEROSPIN_E2E_SYSTEM_MODULE_PATH'] ??
    path.join(packageRoot, 'src/zerospin/system.ts');
  const repoRoot = path.resolve(packageRoot, '../..');
  const devWorkerRuntimeRoot = path.resolve(__dirname, '..');
  const devWorkerPackageRoot = path.resolve(devWorkerRuntimeRoot, '..');
  const devWorkerRuntimeExtension =
    path.basename(devWorkerRuntimeRoot) === 'dist' ? '.js' : '.ts';
  const workerMainPath =
    props.workerMainPath ??
    path.join(devWorkerRuntimeRoot, `DevWorker${devWorkerRuntimeExtension}`);
  const workerdSetupPath = path.join(
    devWorkerRuntimeRoot,
    'vitest',
    `workerdSetup${devWorkerRuntimeExtension}`,
  );
  const wranglerVitestPath =
    wranglerConfigPath ??
    path.join(devWorkerPackageRoot, 'wrangler.vitest.jsonc');
  let coreSrcRoot = path.join(repoRoot, 'packages/core/src');
  if (!fs.existsSync(coreSrcRoot)) {
    const coreTypesPath = require.resolve('@zerospin/core/system/types');
    coreSrcRoot = path.resolve(path.dirname(coreTypesPath), '..');
  }
  let systemWorkerSrcRoot = path.join(repoRoot, 'packages/system-worker/src');
  if (!fs.existsSync(systemWorkerSrcRoot)) {
    const systemWorkerEntryPath = require.resolve('system-worker');
    systemWorkerSrcRoot = path.dirname(systemWorkerEntryPath);
  }
  const systemWorkerEntryPath = path.join(
    systemWorkerSrcRoot,
    path.basename(systemWorkerSrcRoot) === 'dist' ? 'index.js' : 'index.ts',
  );
  const wasmAdapterShimPath = path.join(
    devWorkerRuntimeRoot,
    'shims',
    `makeProvisionedInMemoryWasmSqliteDb${devWorkerRuntimeExtension}`,
  );
  let sqlJsAsmPath = path.join(
    repoRoot,
    'packages/core/node_modules/sql.js/dist/sql-asm.js',
  );
  if (!fs.existsSync(sqlJsAsmPath)) {
    const coreTypesPath = require.resolve('@zerospin/core/system/types');
    const coreRuntimeRoot = path.resolve(path.dirname(coreTypesPath), '..');
    const corePackageRoot = path.resolve(coreRuntimeRoot, '..');
    sqlJsAsmPath = path.join(
      corePackageRoot,
      'node_modules/sql.js/dist/sql-asm.js',
    );
  }

  const wasmToSqljsAdapterShim: Plugin = {
    name: 'wasm-to-sqljs-adapter-shim',
    resolveId(source) {
      if (
        source ===
          '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb' ||
        source.endsWith('makeProvisionedInMemoryWasmSqliteDb.ts') ||
        source.endsWith('makeProvisionedInMemoryWasmSqliteDb')
      ) {
        return wasmAdapterShimPath;
      }
      if (source === 'sql.js') {
        return sqlJsAsmPath;
      }
      return null;
    },
  };

  return defineConfig({
    root: packageRoot,
    resolve: {
      conditions: ['workerd'],
      alias: [
        {
          find: '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb',
          replacement: wasmAdapterShimPath,
        },
        { find: /^sql\.js$/, replacement: sqlJsAsmPath },
        {
          find: /^@\/(.+)$/,
          replacement: `${path.join(packageRoot, 'src')}/$1`,
        },
        {
          find: /^@zerospin\/core\/(.+)$/,
          replacement: `${coreSrcRoot}/$1`,
        },
        {
          find: /^@zerospin\/dev-worker\/(.+)$/,
          replacement: `${devWorkerRuntimeRoot}/$1`,
        },
        { find: 'system', replacement: systemModulePath },
        {
          find: /^system-worker\/(.+)$/,
          replacement: `${systemWorkerSrcRoot}/$1`,
        },
        { find: 'system-worker', replacement: systemWorkerEntryPath },
      ],
    },
    plugins: [
      wasmToSqljsAdapterShim,
      cloudflareTest({
        main: workerMainPath,
        ...(props.workerBindings === undefined
          ? {}
          : { miniflare: { bindings: props.workerBindings } }),
        wrangler: { configPath: wranglerVitestPath },
      }),
    ],
    test: {
      include: [...include],
      isolate: true,
      maxWorkers: 1,
      passWithNoTests,
      setupFiles: [workerdSetupPath, ...setupFiles],
      testTimeout: 300_000,
    },
  });
}
