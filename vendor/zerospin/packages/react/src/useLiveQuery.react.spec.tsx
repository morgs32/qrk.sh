import { act } from 'react';

import { makeMockAggregateSession } from '@zerospin/browser/makeMockSession/makeMockAggregateSession';
import { makeAggregateSessionDefinition } from '@zerospin/core/aggregateSession/make/makeAggregateSessionDefinition';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';
import { createRoot } from 'react-dom/client';
import { expect, expectTypeOf, it } from 'vitest';

import { useLiveQuery } from './useLiveQuery';

it('infers decoded model values from package declarations and renders live changes', async () => {
  const item = makeModelVersion(
    defineModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      attributes: {
        value: primitives.json({
          schema: Schema.Struct({ count: Schema.Number }),
        }),
      },
      indexes: [],
    },
  );
  const session = makeMockAggregateSession({
    definition: makeAggregateSessionDefinition({
      aggregateName: 'test',
      aggregateVersion: '1.0.0',
      actorName: 'writer',
      actorVersion: '1.0.0',
      sessionName: 'writer',
      models: { item },
      contracts: {},
      claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
    }),
    claims: { aggregateId: 'acct_test' },
  });
  function View() {
    const { data } = useLiveQuery({
      session,
      query: db => db.query.item.findMany(),
    });
    expectTypeOf(data).not.toBeAny();
    expectTypeOf(data[0]!.value).toEqualTypeOf<{ readonly count: number }>();
    return <span>{data[0]?.value.count}</span>;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await session.initialize();
    const state = session.store.getState();
    if (!state.isInitialized) throw new Error('Session did not initialize');
    state.db
      .insert(state.schema.item)
      .values({
        id: 'itm_one',
        modelName: 'item',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        value: '{"count":1}',
      })
      .run();
    await act(async () => root.render(<View />));
    expect(container.textContent).toBe('1');
    await act(async () => {
      state.db.update(state.schema.item).set({ value: '{"count":2}' }).run();
      state.db.$client.flushTableChanges();
    });
    expect(container.textContent).toBe('2');
  } finally {
    await act(async () => root.unmount());
    await session.dispose();
  }
});
