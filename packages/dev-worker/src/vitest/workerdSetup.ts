import '@zerospin/core/profiler/extend-expect/extend-expect';
import { SELF } from 'cloudflare:test';
import { beforeAll } from 'vitest';

beforeAll(() => {
  globalThis.fetch = (input, init) => SELF.fetch(new Request(input, init));
});
