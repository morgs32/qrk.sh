import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig, type Plugin } from 'vitest/config';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function makeWorkerdVitestConfig(
  props: {
    packageRoot?: string;
    seedsModulePath?: string;
    systemModulePath?: string;
    include?: readonly string[];
    passWithNoTests?: boolean;
    setupFiles?: readonly string[];
    workerMainPath?: string;
    wranglerConfigPath?: string;
  } = {},
) {
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
    process.env['ZEROSPIN_TEST_SYSTEM_MODULE_PATH'] ??
    path.join(packageRoot, 'src/zerospin/system.ts');

  const repoRoot = path.resolve(packageRoot, '../..');
  const dispatchWorkerRuntimeRoot = path.resolve(__dirname, '..');
  const dispatchWorkerPackageRoot = path.resolve(
    dispatchWorkerRuntimeRoot,
    '..',
  );
  const dispatchWorkerRuntimeExtension =
    path.basename(dispatchWorkerRuntimeRoot) === 'dist' ? '.js' : '.ts';
  const workerMainPath =
    props.workerMainPath ??
    path.join(
      dispatchWorkerRuntimeRoot,
      `Worker${dispatchWorkerRuntimeExtension}`,
    );
  const emptySeedsPath = path.join(
    dispatchWorkerRuntimeRoot,
    `emptySeeds${dispatchWorkerRuntimeExtension}`,
  );
  const seedsModulePath = props.seedsModulePath ?? emptySeedsPath;
  const workerdSetupPath = path.join(
    dispatchWorkerRuntimeRoot,
    'vitest',
    `workerdSetup${dispatchWorkerRuntimeExtension}`,
  );
  const wranglerVitestPath =
    wranglerConfigPath ??
    path.join(dispatchWorkerPackageRoot, 'wrangler.vitest.jsonc');
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
    path.basename(systemWorkerSrcRoot) === 'dist'
      ? 'SystemWorker.js'
      : 'SystemWorker.ts',
  );
  const wasmAdapterShimPath = path.join(
    dispatchWorkerRuntimeRoot,
    'shims',
    `makeMigratedInMemoryWasmSqliteDb${dispatchWorkerRuntimeExtension}`,
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
        source === '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb' ||
        source.endsWith('makeMigratedInMemoryWasmSqliteDb.ts') ||
        source.endsWith('makeMigratedInMemoryWasmSqliteDb')
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
          find: '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb',
          replacement: wasmAdapterShimPath,
        },
        {
          find: /^sql\.js$/,
          replacement: sqlJsAsmPath,
        },
        {
          find: /^@\/(.+)$/,
          replacement: `${path.join(packageRoot, 'src')}/$1`,
        },
        {
          find: /^@zerospin\/core\/(.+)$/,
          replacement: `${coreSrcRoot}/$1`,
        },
        {
          find: /^@zerospin\/dispatch-worker\/(.+)$/,
          replacement: `${dispatchWorkerRuntimeRoot}/$1`,
        },
        {
          find: 'seeds',
          replacement: seedsModulePath,
        },
        {
          find: 'system',
          replacement: systemModulePath,
        },
        {
          find: /^system-worker\/(.+)$/,
          replacement: `${systemWorkerSrcRoot}/$1`,
        },
        {
          find: 'system-worker',
          replacement: systemWorkerEntryPath,
        },
      ],
    },
    plugins: [
      wasmToSqljsAdapterShim,
      cloudflareTest({
        main: workerMainPath,
        wrangler: {
          configPath: wranglerVitestPath,
        },
      }),
    ],
    test: {
      include: [...include],
      env: {
        ZEROSPIN_E2E_SYSTEM_ID: process.env['ZEROSPIN_E2E_SYSTEM_ID'],
        ZEROSPIN_TEST_SYSTEM_ID: process.env['ZEROSPIN_TEST_SYSTEM_ID'],
        ZEROSPIN_E2E_DEPLOY_NAME: process.env['ZEROSPIN_E2E_DEPLOY_NAME'],
        ZEROSPIN_TEST_DEPLOY_NAME: process.env['ZEROSPIN_TEST_DEPLOY_NAME'],
        ZEROSPIN_E2E_CLERK_USER_ID: process.env['ZEROSPIN_E2E_CLERK_USER_ID'],
        ZEROSPIN_TEST_CLERK_USER_ID: process.env['ZEROSPIN_TEST_CLERK_USER_ID'],
      },
      isolate: true,
      maxWorkers: 1,
      passWithNoTests,
      setupFiles: [workerdSetupPath, ...setupFiles],
      testTimeout: 300_000,
    },
  });
}
