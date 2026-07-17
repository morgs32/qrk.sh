import '@zerospin/core/profiler/extend-expect/extend-expect';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  const { exports: workerExports } = await import('cloudflare:workers');
  globalThis.fetch = (input, init) =>
    workerExports.default.fetch(new Request(input, init));
});
