import {
  main as authenticationFixtureFrontend,
  userAggregate as authenticationFixtureOwner,
} from '@zerospin/core/fixtures/system';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { ZerospinError } from '@zerospin/error';
import { CuidFactory } from '@zerospin/schema';
import {
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Result,
  Schema,
} from 'effect';
import { afterAll, describe, expect, it } from 'vitest';

import { initializeGuards as initializeAggregateGuards } from '../aggregate/initializeGuards.ts';
import { defineAggregate } from '../aggregate/defineAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from '../aggregate/makeAggregateVersion.ts';
import { AsyncLive } from '../async/AsyncLive.ts';
import { defineContract } from '../contracts/defineContract.ts';
import { makeContractVersion } from '../contracts/makeContractVersion.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { initializeGuards as initializeFrontendGuards } from '../frontendController/initializeGuards.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { initializeGuards as initializeServiceGuards } from '../service/initializeGuards.ts';
import { makeService } from '../service/makeService.ts';
import { MonotonicFactory } from '../services/MonotonicFactory.ts';
import { makeAggregateSession } from '../session/makeAggregateSession.ts';
import { stageCommand } from '../session/stageCommand.ts';
import { sessionCommandJournalDrizzleSchema } from '../session/sessionCommandShape.ts';
import { sessionRepoTables } from '../session/sessionRepoTables.ts';
import { makeSystem } from '../system/makeSystem.ts';
import { makeSystemConfig } from '../system/makeSystemConfig.ts';
import { makeSystemSpec } from '../system/makeSystemSpec.ts';
import { ZerospinConfigSchema } from '../system/ZerospinConfigSchema.ts';
const guardTestRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

const identity = defineContract('inspect');
const inspect = makeContractVersion(identity, {
  version: '1.0.0',
  payload: {},
  guard: () => Effect.asVoid(CuidFactory),
});

describe('owner guard layers', () => {
  it('initializes aggregate guards in order and releases their local layer', async () => {
    const events: string[] = [];
    const contract = makeContractVersion(defineContract('check'), {
      version: '1.0.0',
      payload: {},
      guard: () =>
        Effect.gen(function* () {
          const id = yield* CuidFactory;
          events.push(`contract:${yield* id()}`);
        }),
    });
    const aggregate = makeAggregateVersion(
      defineAggregate({
        name: 'account',
        layer: Layer.effect(
          CuidFactory,
          Effect.acquireRelease(
            Effect.sync(() => {
              events.push('acquire');
              return () => Effect.succeed('local');
            }),
            () =>
              Effect.sync(() => {
                events.push('release');
              }),
          ),
        ),
      }),
      {
        ...authenticationFixtureOwner.authentication,
        version: '1.0.0',
        models: {},
        selections: {},
        contracts: {
          check: {
            contract,
            guard: () =>
              Effect.sync(() => {
                events.push('binding');
              }),
          },
        },
      },
    );
    expect(events).toEqual([]);
    await Effect.runPromise(
      Effect.gen(function* () {
        const guards = yield* initializeAggregateGuards(aggregate);
        yield* guards.run('check', {
          db: { query: {} },
          authentication: null,
          payload: {},
        });
        yield* guards.run('check', {
          db: { query: {} },
          authentication: null,
          payload: {},
        });
      }).pipe(Effect.scoped),
    );
    expect(events).toEqual([
      'acquire',
      'binding',
      'contract:local',
      'binding',
      'contract:local',
      'release',
    ]);
  });

  it('initializes service guards once per scope and releases the local layer', async () => {
    const events: string[] = [];
    const contract = makeContractVersion(defineContract('check'), {
      version: '1.0.0',
      payload: {},
      guard: () =>
        Effect.gen(function* () {
          const makeId = yield* CuidFactory;
          events.push(yield* makeId());
        }),
    });
    const service = makeService({
      ...authenticationFixtureOwner.authentication,
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: { check: contract },
      layer: Layer.effect(
        CuidFactory,
        Effect.acquireRelease(
          Effect.sync(() => {
            events.push('acquire');
            return () => Effect.succeed('guard');
          }),
          () =>
            Effect.sync(() => {
              events.push('release');
            }),
        ),
      ),
    });
    expect(events).toEqual([]);
    for (let execution = 0; execution < 2; execution++) {
      await Effect.runPromise(
        Effect.gen(function* () {
          const guards = yield* initializeServiceGuards(service);
          yield* guards.run('check', {
            db: { query: {} },
            authentication: null,
            payload: {},
          });
          yield* guards.run('check', {
            db: { query: {} },
            authentication: null,
            payload: {},
          });
        }).pipe(Effect.scoped),
      );
    }
    expect(events).toEqual([
      'acquire',
      'guard',
      'guard',
      'release',
      'acquire',
      'guard',
      'guard',
      'release',
    ]);
  });

  it('assembles and validates executable layers without acquiring or serializing them', () => {
    let acquired = false;
    const layer = Layer.effect(
      CuidFactory,
      Effect.sync(() => {
        acquired = true;
        return () => Effect.succeed('id');
      }),
    );
    const system = makeSystem({
      name: 'test',
      layer,

      aggregates: {},
    });
    expect(system).not.toHaveProperty('runtime');
    expect(system.layer).toBe(layer);
    expect(makeSystemSpec({ system })).not.toHaveProperty('layer');
    expect(acquired).toBe(false);
    expect(
      Schema.is(ZerospinConfigSchema)(
        makeSystemConfig(system, { systemId: 'sys_owner_layers' }),
      ),
    ).toBe(true);
    expect(() =>
      Reflect.apply(makeSystem, undefined, [
        { name: 'test', authentication: [], aggregates: {}, runtime: {} },
      ]),
    ).toThrow();
  });
  it('shares the aggregate layer across versions and keeps service layers separate', async () => {
    const owner = defineAggregate({
      name: 'account',
      layer: Layer.mergeAll(
        Layer.succeed(CuidFactory, () => Effect.succeed('aggregate')),
        Layer.succeed(MonotonicFactory, () => Effect.succeed('binding')),
      ),
    });
    const first = makeAggregateVersion(owner, {
      ...authenticationFixtureOwner.authentication,
      version: '1.0.0',
      models: {},
      contracts: {
        inspect: {
          contract: inspect,
          guard: () => Effect.asVoid(MonotonicFactory),
        },
      },
      selections: {},
    });
    const next = upgradeAggregateVersion(first, { version: '2.0.0' });
    const independent = makeAggregateVersion(owner, {
      ...authenticationFixtureOwner.authentication,
      version: '3.0.0',
      models: {},
      contracts: { inspect: { contract: inspect } },
      selections: {},
    });
    expect(first.layer).toBe(owner.layer);
    expect(next.layer).toBe(owner.layer);
    expect(independent.layer).toBe(owner.layer);
    expect(() =>
      Reflect.apply(makeAggregateVersion, undefined, [
        owner,
        {
          version: '4.0.0',
          models: {},
          contracts: {},
          selections: {},
          layer: Layer.empty,
        },
      ]),
    ).toThrow();
    expect(() =>
      Reflect.apply(upgradeAggregateVersion, undefined, [
        first,
        {
          version: '4.0.0',
          layer: Layer.empty,
        },
      ]),
    ).toThrow();
    const service = makeService({
      ...authenticationFixtureOwner.authentication,
      name: 'catalog',
      version: '1.0.0',
      models: {},
      contracts: { inspect },
      layer: Layer.succeed(CuidFactory, () => Effect.succeed('service')),
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        for (const [owner, expected] of [
          [first, 'aggregate'],
          [next, 'aggregate'],
          [service, 'service'],
        ] satisfies readonly (readonly [
          typeof first | typeof next | typeof service,
          string,
        ])[]) {
          const context = yield* Layer.build(owner.layer);
          const makeId = Context.get(context, CuidFactory);
          expect(yield* makeId()).toBe(expected);
        }
      }).pipe(Effect.scoped),
    );
  });

  it('awaits frontend acquisition, runs guards synchronously, and releases on session close', async () => {
    const events: string[] = [];
    const rejection = new ZerospinError({
      code: 'guard-rejected',
      message: 'Rejected by owner policy',
    });
    let reject = false;
    const guarded = makeContractVersion(identity, {
      version: '1.0.0',
      payload: {},
      guard: () =>
        Effect.gen(function* () {
          const makeId = yield* CuidFactory;
          events.push(yield* makeId());
          if (reject) return yield* rejection;
        }),
    });
    const frontendLayer = Layer.effect(
      CuidFactory,
      Effect.acquireRelease(
        Effect.promise(async () => {
          await Promise.resolve();
          events.push('acquire');
          return () => Effect.succeed('frontend');
        }),
        () =>
          Effect.sync(() => {
            events.push('release');
          }),
      ),
    );
    const frontend = makeFrontendController({
      authenticationSchema: authenticationFixtureFrontend.authentication.authenticationSchema,
      aggregateVersion: '1.0.0',
      systemName: 'test',
      aggregateName: 'account',
      name: 'web',
      models: {},
      contracts: { inspect: { contract: guarded } },
    });
    const session = await Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* Effect.map(
          initializeFrontendGuards({ frontend, layer: frontendLayer }),
          guards =>
            {
              const session = makeAggregateSession({ frontend: frontend });
              session.setExecutionResources({
                sessionId: 'sesn_guard',
                guards,
                runtime: guardTestRuntime,
              });
              return session;
            },
        );
        yield* Effect.addFinalizer(() =>
          Effect.sync(() =>
            session.store.setState({ sessionStatus: 'released' }),
          ),
        );
        expect(events).toEqual(['acquire']);
        const dbConfig = makeResourceDbConfig({
          models: {},
          otherTables: sessionRepoTables,
        });
        const db = yield* makeProvisionedInMemoryWasmSqliteDb({ dbConfig });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            db.$client.sqlite3.close(db.$client.db);
          }),
        );
        session.store.setState({
          sessionId: 'sesn_guard',
          aggregateId: 'acct_guard',
          aggregateName: 'account',
          authentication: { userId: 'usr_guard', aggregateId: 'acct_guard' },
          frontendName: 'web',
          aggregateFrontendLockKey: 'lock',
          db,
          schema: dbConfig.schema,
          models: {},
          isInitialized: true,
          aggregateIndex: 0,
          selectionIndex: 0,
                  selectionHash: 'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
          pushIndex: 0,
          sessionStatus: 'current',
          backupState: { status: 'ready', failure: null },
        });
        expect(
          stageCommand({ session: session, contractName: 'inspect', payload: {} })._tag,
        ).toBe('Success');
        const before = db
          .select()
          .from(sessionCommandJournalDrizzleSchema)
          .all();
        reject = true;
        const failed = stageCommand({ session: session,
          contractName: 'inspect',
          payload: {},
        });
        expect(failed._tag).toBe('Failure');
        expect(
          db.select().from(sessionCommandJournalDrizzleSchema).all(),
        ).toEqual(before);
        expect(events).toEqual(['acquire', 'frontend', 'frontend']);
        return session;
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
    expect(events).toEqual(['acquire', 'frontend', 'frontend', 'release']);
    expect(session.store.getState().sessionStatus).toBe('released');
    expect(
      stageCommand({ session: session, contractName: 'inspect', payload: {} })._tag,
    ).toBe('Failure');
  });

  it('uses app defaults and sibling-local overrides without replacing captured app dependencies', async () => {
    const observed: string[] = [];
    const guard = makeContractVersion(defineContract('check'), {
      version: '1.0.0',
      payload: {},
      guard: () =>
        Effect.gen(function* () {
          const id = yield* CuidFactory;
          const clock = yield* MonotonicFactory;
          observed.push(yield* id(), yield* clock());
        }),
    });
    const leftLayer = Layer.effect(
      CuidFactory,
      Effect.as(MonotonicFactory, () => Effect.succeed('left')),
    );
    const left = makeFrontendController({
      authenticationSchema: authenticationFixtureFrontend.authentication.authenticationSchema,
      systemName: 'test',
      aggregateName: 'account',
      aggregateVersion: '1.0.0',
      name: 'left',
      models: {},
      contracts: { check: { contract: guard } },
    });
    const right = makeFrontendController({
      authenticationSchema: authenticationFixtureFrontend.authentication.authenticationSchema,
      systemName: 'test',
      aggregateName: 'account',
      aggregateVersion: '1.0.0',
      name: 'right',
      models: {},
      contracts: { check: { contract: guard } },
    });
    const appId = Layer.succeed(CuidFactory, () => Effect.succeed('app'));
    const app = Layer.provideMerge(
      Layer.effect(
        MonotonicFactory,
        Effect.map(CuidFactory, id => id),
      ),
      appId,
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const leftGuards = yield* initializeFrontendGuards({
          frontend: left,
          layer: leftLayer,
        });
        const rightGuards = yield* initializeFrontendGuards({ frontend: right });
        yield* leftGuards.run('check', {
          db: { query: {} },
          authentication: null,
          payload: {},
        });
        yield* rightGuards.run('check', {
          db: { query: {} },
          authentication: null,
          payload: {},
        });
      }).pipe(Effect.scoped, Effect.provide(app)),
    );
    expect(observed).toEqual(['left', 'app', 'app', 'app']);
  });

  it('releases partial acquisition on failure and permits a fresh attempt', async () => {
    const events: string[] = [];
    const failure = new ZerospinError({
      code: 'guard-layer-failed',
      message: 'Layer failed',
    });
    let fail = true;
    const frontendLayer = Layer.effect(
      CuidFactory,
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            events.push('acquire');
          }),
          () =>
            Effect.sync(() => {
              events.push('release');
            }),
        );
        if (fail) return yield* failure;
        return () => Effect.succeed('id');
      }),
    );
    const frontend = makeFrontendController({
      authenticationSchema: authenticationFixtureFrontend.authentication.authenticationSchema,
      aggregateVersion: '1.0.0',
      systemName: 'test',
      aggregateName: 'account',
      name: 'web',
      models: {},
      contracts: { inspect: { contract: inspect } },
    });
    const result = await Effect.runPromise(
      Effect.map(
        initializeFrontendGuards({ frontend, layer: frontendLayer }),
        guards => {
          const session = makeAggregateSession({ frontend });
          session.setExecutionResources({
            sessionId: 'sesn_failure',
            guards,
            runtime: guardTestRuntime,
          });
          return session;
        },
      ).pipe(Effect.scoped, Effect.result),
    );
    expect(Result.isFailure(result) && result.failure).toBe(failure);
    expect(events).toEqual(['acquire', 'release']);
    fail = false;
    const exit = await Effect.runPromise(
      Effect.map(
        initializeFrontendGuards({ frontend, layer: frontendLayer }),
        guards => {
          const session = makeAggregateSession({ frontend });
          session.setExecutionResources({
            sessionId: 'sesn_retry',
            guards,
            runtime: guardTestRuntime,
          });
          return session;
        },
      ).pipe(Effect.scoped, Effect.exit),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(events).toEqual(['acquire', 'release', 'acquire', 'release']);
  });
});

afterAll(() => guardTestRuntime.dispose());
