import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

/** Serve the same origin-relative worker identity in dev and every client build. */
export function backupWorkerPlugin(): Plugin {
  const assets = [
    {
      fileName: '__zerospin/backup-worker.js',
      source: new URL('./backupWorker.bundle.js', import.meta.url),
      mime: 'text/javascript',
    },
    {
      fileName: '__zerospin/wa-sqlite-async.wasm',
      source: new URL('./wa-sqlite-async.wasm', import.meta.url),
      mime: 'application/wasm',
    },
  ];
  return {
    name: 'zerospin-backup-worker',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = assets.find(
          candidate => `/${candidate.fileName}` === request.url?.split('?')[0],
        );
        if (!asset) return next();
        void readFile(fileURLToPath(asset.source))
          .then(bytes => {
            response.setHeader('Content-Type', asset.mime);
            response.setHeader('Cache-Control', 'no-cache');
            response.end(bytes);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      if (this.environment.config.build.ssr) return;
      for (const asset of assets) {
        this.emitFile({
          type: 'asset',
          fileName: asset.fileName,
          source: await readFile(fileURLToPath(asset.source)),
        });
      }
    },
  };
}
