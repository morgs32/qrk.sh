import { SELF } from 'cloudflare:test';
import { config as workerConfig, system as workerSystem } from 'system';
import { expect, it } from 'vitest';

import config, { system } from './zerospin.config';

it('uses the generated system entry with the authored system capability', async () => {
  expect(workerSystem).toBe(system);
  expect(workerConfig).toBe(config);
  expect(config.system).toBe(system);

  const response = await SELF.fetch('https://config.test/');
  expect(await response.json()).toEqual({
    name: 'typed-config-fixture',
    sameSystem: true,
  });
});
