import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { makeResourceDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { makeProvisionedInMemorySqljsDb } from '../drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';

import { applyExecutionDeltaTx } from './applyExecutionDeltaTx.ts';
it('preserves JSON text while installing authoritative resources', async () => {
  const checkout = makeModelVersion(
    defineModel({ name: 'checkout', abbreviation: 'chk' }),
    {
      version: '1.0.0',
      attributes: {
        quote: primitives.json({
          schema: Schema.Struct({ total: Schema.Number }),
        }),
      },
      indexes: [],
    },
  );
  const config = makeResourceDbConfig({ models: { checkout } });
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: config }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  try {
    const resource = {
      id: 'chk_test',
      modelName: 'checkout',
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      quote: JSON.stringify({ total: 100 }),
    };
    db.transaction(tx =>
      Effect.runSync(
        applyExecutionDeltaTx({
          tx,
          models: { checkout },
          executionDelta: { inserted: [resource], updated: [], deleted: [] },
        }),
      ),
    );
    expect(db.query.checkout.findFirst().sync()?.quote).toBe('{"total":100}');
    db.transaction(tx =>
      Effect.runSync(
        applyExecutionDeltaTx({
          tx,
          models: { checkout },
          executionDelta: {
            inserted: [],
            updated: [{ ...resource, quote: JSON.stringify({ total: 200 }) }],
            deleted: [],
          },
        }),
      ),
    );
    expect(db.query.checkout.findFirst().sync()?.quote).toBe('{"total":200}');
  } finally {
    if (
      '$client' in db &&
      db.$client instanceof Object &&
      'close' in db.$client &&
      typeof db.$client.close === 'function'
    ) {
      db.$client.close();
    }
  }
});
