import { it } from '@effect/vitest';
import { checkGuards } from '@zerospin/core/aggregateSession/checkGuards';
import { replayPendingCommandsTx } from '@zerospin/core/aggregateSession/replayPendingCommandsTx';
import { sessionRepoDbConfig } from '@zerospin/core/aggregateSession/sessionRepoDbConfig';
import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { validateSessionCommand } from '@zerospin/core/aggregateSession/validateSessionCommand';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { CuidFactory, primitives } from '@zerospin/schema';
import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeMockAggregateSession } from './makeMockAggregateSession';

class Capability extends Context.Service<Capability, { value: number }>()(
  'SessionExecutionCapability',
) {}
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { value: primitives.integer() },
    indexes: [],
  },
);
const claims = Schema.Struct({
  aggregateId: Schema.String,
  user: Schema.String,
});

describe('session runtime execution', () => {
  it.effect(
    'reuses services through guards, validation, staging, and pending replay',
    () =>
      Effect.gen(function* () {
        const seen: object[] = [];
        const ids: string[] = [];
        let acquired = 0;
        let liveIds = 0;
        const create = makeContractVersion(defineContract('create'), {
          version: '1.0.0',
          models: { item },
          payload: {},
          failures: {},
          claims,
          guard: Effect.fn(function* ({ claims, queryDb }) {
            seen.push(yield* Capability);
            expect(claims.user).toBe('owner');
            expect(queryDb.query.item.findMany().sync()).toEqual([]);
          }),
          program: Effect.fn(function* ({ models, claims }) {
            const capability = yield* Capability;
            seen.push(capability);
            expect(claims.user).toBe('owner');
            ids.push(yield* (yield* CuidFactory)());
            return [
              yield* models.item.create({
                resourceId: 'itm_test',
                attributes: { value: capability.value },
              }),
            ];
          }),
        });
        const definition = {
          kind: 'aggregate' as const,
          aggregateName: 'test',
          aggregateVersion: '1.0.0',
          actorName: 'writer',
          actorVersion: '1.0.0',
          sessionName: 'writer',
          models: { item },
          contracts: { create },
          claimsSchema: claims,
        };
        const layer = Layer.mergeAll(
          Layer.effect(
            Capability,
            Effect.sync(() => ({ value: ++acquired })),
          ),
          Layer.succeed(CuidFactory, () =>
            Effect.sync(() => `live${++liveIds}`),
          ),
        );
        const session = makeMockAggregateSession({
          definition,
          claims: { aggregateId: 'acct_test', user: 'owner' },
          layer,
        });
        try {
          yield* Effect.promise(() => session.initialize());
          expect(
            yield* checkGuards({
              session,
              contractName: 'create',
              payload: {},
            }),
          ).toBeNull();
          const beforeValidation = liveIds;
          // The returned Effect must also work without the caller providing session services.
          expect(
            yield* validateSessionCommand({
              session,
              contractName: 'create',
              payload: {},
            }),
          ).toEqual({ _tag: 'Success', success: undefined });
          expect(liveIds).toBe(beforeValidation);
          expect(ids).toEqual(['validation1']);
          const sessionId = session.store.getState().sessionId;
          if (sessionId === null) throw new Error('Session not ready');
          session.setExecutionResources({
            sessionId,
            runtime: session.runtime,
            settleLocally: false,
          });
          expect(
            stageCommand({ session, contractName: 'create', payload: {} })._tag,
          ).toBe('Success');
          const state = session.store.getState();
          if (
            !state.isInitialized ||
            state.db === null ||
            state.schema === null
          ) {
            throw new Error('Session not ready');
          }
          expect(state.db.query.item.findFirst().sync()?.value).toBe(1);
          state.db.delete(state.schema.item).run();
          state.db.transaction(tx =>
            session.runtime.runSync(
              replayPendingCommandsTx({ tx, definition: session.definition }),
            ),
          );
          expect(state.db.query.item.findFirst().sync()?.value).toBe(1);
          const capability = session.runtime.runSync(Capability);
          expect(seen.length).toBe(7);
          expect(seen.every(value => value === capability)).toBe(true);
          expect(acquired).toBe(1);
          expect(ids).toHaveLength(3);
        } finally {
          yield* Effect.promise(() => session.dispose());
        }
      }),
  );

  it('allows asynchronous service acquisition but rejects asynchronous command execution', async () => {
    const guarded = makeContractVersion(defineContract('guarded'), {
      version: '1.0.0',
      models: { item },
      payload: {},
      failures: {},
      guard: Effect.fn(function* () {
        yield* Capability;
        yield* Effect.promise(() => Promise.resolve());
      }),
    });
    const create = makeContractVersion(defineContract('create'), {
      version: '1.0.0',
      models: { item },
      payload: {},
      failures: {},
      program: Effect.fn(function* ({ models }) {
        yield* Capability;
        yield* Effect.promise(() => Promise.resolve());
        return [
          yield* models.item.create({
            resourceId: 'itm_async',
            attributes: { value: 1 },
          }),
        ];
      }),
    });
    const definition = {
      kind: 'aggregate' as const,
      aggregateName: 'test',
      aggregateVersion: '1.0.0',
      actorName: 'writer',
      actorVersion: '1.0.0',
      sessionName: 'writer',
      models: { item },
      contracts: {
        create,
        guarded,
      },
      claimsSchema: claims,
    };
    const session = makeMockAggregateSession({
      definition,
      claims: { aggregateId: 'acct_test', user: 'owner' },
      layer: Layer.effect(
        Capability,
        Effect.promise(async () => ({ value: 1 })),
      ),
    });
    try {
      await session.initialize();
      expect(
        await session.runtime.runPromise(
          checkGuards({ session, contractName: 'guarded', payload: {} }),
        ),
      ).toMatchObject({ code: 'program-must-be-synchronous' });
      expect(
        stageCommand({ session, contractName: 'create', payload: {} }),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'program-must-be-synchronous' },
      });
      expect(session.store.getState().db?.query.item.findMany().sync()).toEqual(
        [],
      );
    } finally {
      await session.dispose();
    }
  });
});

it('rolls back failed staging without retaining history or consuming a session position', async () => {
  const create = makeContractVersion(defineContract('create'), {
    version: '1.0.0',
    models: { item },
    payload: { fail: primitives.boolean() },
    failures: {},
    claims,
    program: Effect.fn(function* ({ models, payload }) {
      const created = yield* models.item.create({
        resourceId: 'itm_atomic',
        attributes: { value: 1 },
      });
      return payload.fail
        ? [
            created,
            yield* models.item.update({
              resourceId: 'itm_missing',
              attributes: { value: 2 },
            }),
          ]
        : [created];
    }),
  });
  const definition = {
    kind: 'aggregate' as const,
    aggregateName: 'test',
    aggregateVersion: '1.0.0',
    actorName: 'writer',
    actorVersion: '1.0.0',
    sessionName: 'writer',
    models: { item },
    contracts: { create },
    claimsSchema: claims,
  };
  const session = makeMockAggregateSession({
    definition,
    claims: { aggregateId: 'acct_test', user: 'owner' },
  });
  try {
    await session.initialize();
    const db = session.store.getState().db;
    if (db === null) throw new Error('Session not ready');
    const failure = stageCommand({
      session,
      contractName: 'create',
      payload: { fail: true },
    });
    expect(failure).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'mutation-row-not-found' },
    });
    expect(db.query.item.findMany().sync()).toEqual([]);
    expect(db.select().from(sessionRepoDbConfig.schema.commands).all()).toEqual(
      [],
    );
    expect(
      db
        .select()
        .from(sessionRepoDbConfig.schema.optimisticAppliedMutations)
        .all(),
    ).toEqual([]);
    const success = stageCommand({
      session,
      contractName: 'create',
      payload: { fail: false },
    });
    expect(success).toMatchObject({
      _tag: 'Success',
      success: {
        sessionIndex: 1,
        admission: { status: 'skipped', reason: 'local-only' },
        execution: { status: 'skipped', reason: 'local-only' },
      },
    });
    const rows = db.select().from(sessionRepoDbConfig.schema.commands).all();
    expect(rows).toHaveLength(1);
    const command = Effect.runSync(
      sessionRepoDbConfig.tables.commands.decodeRow(rows[0]),
    );
    expect(command.staging.completedAt.getTime()).toBeGreaterThanOrEqual(
      command.staging.startedAt.getTime(),
    );
    expect(command.staging.stagedDelta.inserted).toHaveLength(1);
    expect(command.staging).not.toHaveProperty('failure');
    expect(command.staging).not.toHaveProperty('status');
  } finally {
    await session.dispose();
  }
});
