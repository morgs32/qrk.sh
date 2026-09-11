import { SELF } from 'cloudflare:test';
import workerConfig from 'config';
import { expect, it } from 'vitest';

import config, { system } from './zerospin.config';

it('uses the direct config alias with the authored system capability', async () => {
  expect(workerConfig.system).toBe(system);
  expect(workerConfig).toBe(config);
  expect(config.system).toBe(system);

  const response = await SELF.fetch('https://config.test/');
  expect(await response.json()).toEqual({
    name: 'typed-config-fixture',
    sameSystem: true,
  });
});
