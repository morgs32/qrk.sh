import { env, listDurableObjectIds, reset } from 'cloudflare:test';
import { afterEach, expect, it } from 'vitest';

import { makeSystemRuntime } from '../../makeSystemRuntime.js';
import { SystemRepo } from '../SystemRepo.js';

afterEach(reset);

it('initializes services without opening aggregate materializers', async () => {
  const runtime = makeSystemRuntime();
  try {
    const before = await listDurableObjectIds(env.VERSIONED_AGGREGATE_REPO);
    const source = await runtime.runPromise(
      SystemRepo.getRepo({ key: { systemId: env.ZEROSPIN_SYSTEM_ID } }),
    );
    expect(await source.initialize()).toEqual({
      _tag: 'Success',
      success: undefined,
    });
    expect(
      await listDurableObjectIds(env.SERVICE_ADMITTED_CHAIN),
    ).not.toHaveLength(0);
    expect(
      (await listDurableObjectIds(env.VERSIONED_AGGREGATE_REPO))
        .map(id => id.toString())
        .sort(),
    ).toEqual(before.map(id => id.toString()).sort());
  } finally {
    await runtime.dispose();
  }
});
