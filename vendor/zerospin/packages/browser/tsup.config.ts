import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { makeSharedWorker: 'src/makeSharedWorker.ts' },
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  outDir: 'dist',
  outExtension: () => ({ js: '.bundle.js' }),
  clean: false,
  dts: false,
  sourcemap: false,
  minify: true,
  esbuildOptions(options) {
    options.legalComments = 'none';
  },
  splitting: false,
  noExternal: [/.*/],
  async onSuccess() {
    const require = createRequire(import.meta.url);
    const wasm = await readFile(
      join(
        dirname(require.resolve('wa-sqlite/dist/wa-sqlite-async.mjs')),
        'wa-sqlite-async.wasm',
      ),
    );
    const runtime = await readFile('dist/makeSharedWorker.bundle.js', 'utf8');
    const placeholder = '__ZEROSPIN_SHARED_WORKER_VERSION__';
    if (!runtime.includes(placeholder)) {
      throw new Error('Worker version placeholder is missing');
    }
    const version = createHash('sha256')
      .update(runtime)
      .update(wasm)
      .digest('hex');
    await writeFile(
      'dist/makeSharedWorker.bundle.js',
      runtime.replaceAll(placeholder, version),
    );
    await writeFile(
      'dist/sharedWorkerVersion.js',
      `export const sharedWorkerVersion = ${JSON.stringify(version)};\n`,
    );
    await writeFile('dist/sqlite.wasm', wasm);
  },
});
