import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import type { ISystemConfig } from '@zerospin/core/system/types';
import { defineConfig, type Plugin } from 'vitest/config';
import { unstable_getVarsForDev } from 'wrangler';

import { makeWranglerConfig } from '../makeWranglerConfig.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function makeWorkerdVitestConfig(props: {
  config: ISystemConfig;
  packageRoot?: string;
  systemModulePath?: string;
  include?: readonly string[];
  passWithNoTests?: boolean;
  setupFiles?: readonly string[];
  workerBindings?: Readonly<Record<string, string | boolean>>;
  workerMainPath?: string;
}) {
  const {
    include = ['src/**/*.workerd.spec.ts'],
    packageRoot = process.cwd(),
    passWithNoTests = true,
    setupFiles = [],
    workerBindings,
    config,
  } = props;
  const repoRoot = path.resolve(packageRoot, '../..');
  const devWorkerRuntimeRoot = path.resolve(__dirname, '..');
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
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        source ===
          '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb' ||
        source.endsWith('makeProvisionedInMemoryWasmSqliteDb.ts') ||
        source.endsWith('makeProvisionedInMemoryWasmSqliteDb')
      ) {
        return wasmAdapterShimPath;
      }
      // The test's plain in-memory initializer uses asm; Repos that provide a
      // compiled Wasm module must keep SQL.js's matching Wasm runtime.
      if (
        source === 'sql.js' &&
        importer !== undefined &&
        /\/drizzle\/makeInMemorySqlJsDatabase\.(?:ts|js)$/.test(importer)
      ) {
        return sqlJsAsmPath;
      }
      return null;
    },
  };

  const generatedRoot = path.join(packageRoot, '.wrangler', 'zerospin');
  fs.mkdirSync(generatedRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(generatedRoot, 'vitest-'));
  // Vite owns normal shutdown; the exit hook also handles configuration/startup
  // failures before Vite has installed its plugin disposal lifecycle.
  const generatedFiles = {
    name: 'zerospin-generated-worker-config',
    closeBundle() {
      process.off('exit', generatedFiles.closeBundle);
      fs.rmSync(directory, { force: true, recursive: true });
    },
  };
  process.once('exit', generatedFiles.closeBundle);
  try {
    const systemModulePath = path.resolve(
      props.systemModulePath ??
        process.env['ZEROSPIN_E2E_SYSTEM_MODULE_PATH'] ??
        path.join(directory, 'system.ts'),
    );
    if (
      !props.systemModulePath &&
      !process.env['ZEROSPIN_E2E_SYSTEM_MODULE_PATH']
    ) {
      fs.writeFileSync(
        systemModulePath,
        `import configuration from ${JSON.stringify(path.resolve(packageRoot, 'zerospin.config.ts'))};\nexport const config = configuration;\nexport const system = config.system;\n`,
        { mode: 0o600 },
      );
    }
    const generatedConfig = makeWranglerConfig({
      config,
      main: path.resolve(packageRoot, workerMainPath),
      systemModulePath,
      environment:
        workerBindings?.['ZEROSPIN_ENVIRONMENT'] === 'production'
          ? 'production'
          : 'dev',
    });
    const wranglerVitestPath = path.join(directory, 'wrangler.json');
    fs.writeFileSync(
      wranglerVitestPath,
      JSON.stringify(generatedConfig, null, 2),
      { mode: 0o600 },
    );
    const localBindings = Object.fromEntries(
      Object.entries(
        unstable_getVarsForDev(
          path.join(packageRoot, 'zerospin.config.ts'),
          undefined,
          {},
          undefined,
          true,
        ),
      ).map(([name, binding]) => [name, binding.value]),
    );
    return defineConfig({
      root: packageRoot,
      resolve: {
        conditions: ['workerd'],
        alias: [
          {
            find: /^capnweb$/,
            replacement: path.join(
              path.dirname(
                require.resolve('capnweb', { paths: [systemWorkerSrcRoot] }),
              ),
              'index-workers.js',
            ),
          },
          {
            find: '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb',
            replacement: wasmAdapterShimPath,
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
        generatedFiles,
        wasmToSqljsAdapterShim,
        cloudflareTest({
          main: generatedConfig.main,
          miniflare: {
            bindings: {
              ...localBindings,
              ...workerBindings,
              ...generatedConfig.vars,
            },
          },
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
  } catch (cause) {
    generatedFiles.closeBundle();
    throw cause;
  }
}
