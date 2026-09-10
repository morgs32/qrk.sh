import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { defineConfig, type Plugin } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cloudflareWorkersVirtualId = '\0cloudflare:workers-stub';

/** Node Vitest stub for `cloudflare:workers` when *.node.spec.ts imports DO modules. */
function cloudflareWorkersStub(): Plugin {
  return {
    name: 'cloudflare-workers-stub',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/sql-wasm.wasm')) return '\0sql-wasm';
      if (source === 'cloudflare:workers') {
        return cloudflareWorkersVirtualId;
      }
      return null;
    },
    load(id) {
      if (id === '\0sql-wasm') {
        return `export default new WebAssembly.Module(Uint8Array.from(Buffer.from('${readFileSync(path.join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')).toString('base64')}', 'base64')))`;
      }
      if (id === cloudflareWorkersVirtualId) {
        return [
          'export class DurableObject {}',
          'export class RpcTarget {}',
          'export class WorkerEntrypoint {}',
          'export const env = {}',
          'export const exports = {}',
        ].join('\n');
      }
      return null;
    },
  };
}

/** Later paths only fill vars missing from earlier files */
loadEnv({ path: path.join(__dirname, '.env.local') });
loadEnv({ path: path.join(__dirname, '.env') });
loadEnv({ path: path.join(__dirname, '.env.test') });

/** Vitest workspaces do not merge parent `resolve`; mirror aliases on each project. */
const resolveAlias = {
  conditions: ['node'],
  alias: {
    internal: path.resolve(__dirname, 'src'),
    system: path.resolve(__dirname, 'src/fixtures/system.ts'),
    '@zerospin/core': path.resolve(__dirname, '../core/src'),
    '@livestore/wa-sqlite/dist/wa-sqlite.mjs': path.resolve(
      __dirname,
      '../core/node_modules/@livestore/wa-sqlite/dist/wa-sqlite.node.mjs',
    ),
  },
};

export default defineConfig({
  root: __dirname,
  resolve: resolveAlias,
  plugins: [cloudflareWorkersStub()],
  ssr: {
    noExternal: ['partyserver', 'sql.js'],
  },
  test: {
    name: 'core-node',
    environment: 'node',
    globals: true,
    include: ['src/**/*.node.spec.ts'],
  },
});
