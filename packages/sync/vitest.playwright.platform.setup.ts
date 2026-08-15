import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setup() {
  const dispatchUrl = process.env.ZEROSPIN_SYNC_DISPATCH_URL?.trim();
  if (dispatchUrl === undefined || dispatchUrl === '') {
    throw new Error(
      'Missing ZEROSPIN_SYNC_DISPATCH_URL. Deploy sync-dispatch and sync-fixture (see packages/sync/README.md), then export the dispatch worker URL.',
    );
  }

  return Promise.resolve();
}
