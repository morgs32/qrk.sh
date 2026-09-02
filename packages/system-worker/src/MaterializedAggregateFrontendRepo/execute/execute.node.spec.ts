import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import {
  AggregateFrontendFinalizedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { ZerospinError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';
import { main, system } from 'system';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executePushedCommand } from '../executePushedCommand/executePushedCommand.js';
import {
  makeMaterializedAggregateFrontendRepoDbConfig,
  materializedAggregateFrontendRepoDrizzleSchemas,
} from '../MaterializedAggregateFrontendRepoDbConfig.js';

import { execute } from './execute.js';

const projectAggregateFrontendResourceMock = vi.hoisted(() => vi.fn());

vi.mock(
  '../projectAggregateFrontendResource/projectAggregateFrontendResource.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../projectAggregateFrontendResource/projectAggregateFrontendResource.js')
      >();
    projectAggregateFrontendResourceMock.mockImplementation(
      actual.projectAggregateFrontendResource,
    );
    return {
      ...actual,
      projectAggregateFrontendResource: projectAggregateFrontendResourceMock,
    };
  },
);

vi.mock('../../AggregateCommandChain/AggregateCommandChain.js', async () => {
  const { Effect } = await import('effect');
  return {
    AggregateCommandChain: {
      fixedDORepoConfig: {
        nameUtils: {
          makeName: Effect.fn('AggregateCommandChain.makeTestName')(
            function* (key: {
              systemId: string;
              aggregateId: string;
              aggregateName: string;
            }) {
              yield* Effect.void;
              return `aggchain_${key.systemId}/${key.aggregateId}/${key.aggregateName}`;
            },
          ),
        },
      },
    },
  };
});

describe('MaterializedAggregateFrontendRepo.execute', () => {
  beforeEach(() => {
    projectAggregateFrontendResourceMock.mockClear();
  });

  it('rewinds A/B/C, resolves B, and replays unresolved A then C', async () => {
    const aggregate = system.aggregates.user;
    const frontendBinding = aggregate.frontends.main;
    const dbConfig = await Effect.runPromise(
      makeMaterializedAggregateFrontendRepoDbConfig({
        aggregateName: 'user',
        aggregateModels: aggregate.models,
        frontendModels: frontendBinding.controller.models,
      }),
    );
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    db.insert(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
      .values({
        id: 1,
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
        userId: 'user_test',
        frontendName: 'main',
        status: 'ready',
        aggregateIndex: 0,
        pushIndex: 0,
        frontendIndex: 0,
      })
      .run();

    const localCommands: Schema.Schema.Type<typeof SessionCommandSchema>[] = [];
    for (const [offset, theme] of ['a', 'b', 'c'].entries()) {
      const commandId = `cmd_middle_${theme}`;
      const resourceId = `acct_middle_${theme}`;
      const appliedAt = new Date(`2026-08-31T12:00:0${offset}.000Z`);
      const mutation = await Effect.runPromise(
        main.models.account.create('1.0.0', {
          resourceId,
          attributes: { name: theme },
        }),
      );
      const encodedMutation = await Effect.runPromise(
        encodeAppliedMutation({
          mutation: {
            ...mutation,
            commandId,
            mutationIndex: 0,
            appliedAt,
            lastAppliedAt: null,
            inverseOperation: null,
          },
        }),
      );
      const resource = {
        id: resourceId,
        modelName: 'account',
        version: '1.0.0',
        createdAt: appliedAt,
        updatedAt: appliedAt,
        name: theme,
      };
      localCommands.push({
        id: commandId,
        commandName: 'setPreference',
        payload: JSON.stringify({ theme }),
        contractVersion: '1.0.0',
        aggregateId: 'acct_test',
        aggregateName: 'user',
        systemName: 'system-worker',
        sessionId: `sesn_middle_${theme}`,
        userId: 'user_test',
        frontendName: 'main',
        sessionIndex: offset + 1,
        pushIndex: null,
        chainedAt: appliedAt,
        delta: {
          inserted: [resource],
          updated: [],
          deleted: [],
          mutations: [encodedMutation],
        },
        failedAt: null,
        failure: null,
      });
    }

    for (const [offset, command] of localCommands.entries()) {
      const pushed = await Effect.runPromise(
        executePushedCommand({
          chainedAt: new Date(`2026-08-31T12:01:0${offset}.000Z`),
          command,
          db,
          key: {
            systemId: 'sys_test',
            aggregateId: 'acct_test',
            aggregateName: 'user',
            userId: 'user_test',
            frontendName: 'main',
          },
          pushIndex: offset + 1,
        }),
      );
      expect(pushed).toMatchObject({ failedAt: null, failure: null });
    }

    const middle = localCommands[1];
    if (middle === undefined || middle.delta === null) {
      throw new Error('middle command missing');
    }
    const { sessionIndex: _sessionIndex, ...middleCommand } = middle;
    const source: Schema.Schema.Type<typeof AggregateChainedCommandSchema> = {
      ...middleCommand,
      pushIndex: 2,
      aggregateIndex: 1,
      chainedAt: new Date('2026-08-31T12:02:00.000Z'),
      delta: middle.delta,
      failedAt: null,
      failure: null,
    };
    let pulls = 0;
    const aggregateCommandChains = {
      getByName: (_name: string) => ({
        getCommands: (props: { afterAggregateIndex: number | null }) => {
          pulls += 1;
          return Effect.runPromise(
            encodeRpc(
              Effect.succeed(
                props.afterAggregateIndex === null
                  ? { commands: [source], tip: 1 }
                  : { commands: [], tip: 1 },
              ),
            ),
          );
        },
      }),
    };
    const delivery = {
      aggregateCommandChains,
      command: source,
      db,
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
        userId: 'user_test',
        frontendName: 'main',
      },
      schema: dbConfig.schema,
    };

    await Effect.runPromise(execute(delivery).pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(execute(delivery).pipe(Effect.provide(AsyncLive)));

    expect(pulls).toBe(1);
    expect(projectAggregateFrontendResourceMock).toHaveBeenCalledTimes(1);
    expect(
      db
        .select({ id: main.models.account.drizzleSchema.id })
        .from(main.models.account.drizzleSchema)
        .all()
        .map(row => row.id)
        .sort(),
    ).toEqual(['acct_middle_a', 'acct_middle_b', 'acct_middle_c']);
    expect(
      db
        .select()
        .from(materializedAggregateFrontendRepoDrizzleSchemas.activeOptimism)
        .all()
        .map(row => row.pushIndex)
        .sort(),
    ).toEqual([1, 3]);
    expect(
      db
        .select()
        .from(materializedAggregateFrontendRepoDrizzleSchemas.resolvedPushes)
        .all(),
    ).toEqual([{ pushIndex: 2, commandId: 'cmd_middle_b' }]);
    const outbox = db
      .select()
      .from(
        materializedAggregateFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
      )
      .get();
    expect(outbox).toBeDefined();
    const executionClaim = db
      .select()
      .from(materializedAggregateFrontendRepoDrizzleSchemas.executionClaims)
      .get();
    expect(executionClaim?.completedAt).toBeInstanceOf(Date);
    expect(executionClaim?.result).toBe(outbox?.command);
    const finalized = Schema.decodeUnknownSync(
      Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
    )(outbox?.command);
    expect(finalized.delta?.inserted.map(resource => resource.id)).toEqual([
      'acct_middle_b',
    ]);
    expect(finalized.delta?.updated).toEqual([]);
    expect(finalized.delta?.deleted).toEqual([]);

    const changed = await Effect.runPromise(
      execute({
        ...delivery,
        command: { ...source, payload: '{"changed":true}' },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(changed)).toBe(true);
    if (Result.isFailure(changed)) {
      expect(changed.failure.code).toBe(
        'materialized-aggregate-frontend-source-command-conflict',
      );
    }
  });

  it('retains projection failures and halts an in-doubt claim without rerunning projection', async () => {
    const aggregate = system.aggregates.user;
    const dbConfig = await Effect.runPromise(
      makeMaterializedAggregateFrontendRepoDbConfig({
        aggregateName: 'user',
        aggregateModels: aggregate.models,
        frontendModels: aggregate.frontends.main.controller.models,
      }),
    );
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    const key = {
      systemId: 'sys_test',
      aggregateId: 'acct_projection_failure',
      aggregateName: 'user',
      userId: 'user_test',
      frontendName: 'main',
    };
    db.insert(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
      .values({
        id: 1,
        ...key,
        status: 'ready',
        aggregateIndex: 0,
        pushIndex: 0,
        frontendIndex: 0,
      })
      .run();
    const source = Schema.decodeUnknownSync(AggregateChainedCommandSchema)({
      id: 'cmd_projection_failure',
      commandName: 'setPreference',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      systemName: 'system-worker',
      sessionId: null,
      userId: null,
      frontendName: null,
      pushIndex: null,
      aggregateIndex: 1,
      chainedAt: '2026-08-31T13:00:00.000Z',
      delta: {
        inserted: [
          {
            id: 'acct_projected_failure',
            modelName: 'account',
            version: '1.0.0',
            createdAt: '2026-08-31T13:00:00.000Z',
            updatedAt: '2026-08-31T13:00:00.000Z',
            name: 'Projection failure',
          },
        ],
        updated: [],
        deleted: [],
        mutations: [],
      },
      failedAt: null,
      failure: null,
    });
    let pulls = 0;
    const aggregateCommandChains = {
      getByName: (_name: string) => ({
        getCommands: (props: { afterAggregateIndex: number | null }) => {
          pulls += 1;
          return Effect.runPromise(
            encodeRpc(
              Effect.succeed(
                props.afterAggregateIndex === null
                  ? { commands: [source], tip: 1 }
                  : { commands: [], tip: 1 },
              ),
            ),
          );
        },
      }),
    };
    const delivery = {
      aggregateCommandChains,
      command: source,
      db,
      key,
      schema: dbConfig.schema,
    };
    projectAggregateFrontendResourceMock.mockImplementationOnce(() =>
      Effect.fail(
        new ZerospinError({
          code: 'fixture-projection-failed',
          message: 'Projection failed',
        }),
      ),
    );

    await Effect.runPromise(execute(delivery).pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(execute(delivery).pipe(Effect.provide(AsyncLive)));

    const completedClaim = db
      .select()
      .from(materializedAggregateFrontendRepoDrizzleSchemas.executionClaims)
      .get();
    expect(completedClaim?.completedAt).toBeInstanceOf(Date);
    expect(completedClaim?.result).not.toBeNull();
    const finalized = Schema.decodeUnknownSync(
      Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
    )(completedClaim?.result);
    expect(finalized.delta).toEqual({
      inserted: [],
      updated: [],
      deleted: [],
      mutations: [],
    });
    expect(finalized.failedAt).toBeInstanceOf(Date);
    expect(finalized.failure).toMatchObject({
      code: 'fixture-projection-failed',
    });
    expect(projectAggregateFrontendResourceMock).toHaveBeenCalledTimes(1);
    expect(pulls).toBe(1);

    const inDoubtDb = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({ dbConfig }).pipe(
        Effect.provide(AsyncLive),
      ),
    );
    inDoubtDb
      .insert(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
      .values({
        id: 1,
        ...key,
        status: 'ready',
        aggregateIndex: 0,
        pushIndex: 0,
        frontendIndex: 0,
      })
      .run();
    const canonicalBytes = Schema.encodeSync(
      Schema.fromJsonString(AggregateChainedCommandSchema),
    )(source);
    inDoubtDb
      .insert(materializedAggregateFrontendRepoDrizzleSchemas.executionClaims)
      .values({
        aggregateIndex: source.aggregateIndex,
        commandId: source.id,
        canonicalBytes,
        command: canonicalBytes,
        claimedAt: new Date('2026-08-31T13:00:01.000Z'),
        completedAt: null,
        result: null,
      })
      .run();
    const projectionCallCount =
      projectAggregateFrontendResourceMock.mock.calls.length;
    const inDoubt = await Effect.runPromise(
      execute({ ...delivery, db: inDoubtDb }).pipe(
        Effect.provide(AsyncLive),
        Effect.result,
      ),
    );
    expect(Result.isFailure(inDoubt)).toBe(true);
    if (Result.isFailure(inDoubt)) {
      expect(inDoubt.failure.code).toBe(
        'materialized-aggregate-frontend-execution-in-doubt',
      );
    }
    expect(projectAggregateFrontendResourceMock).toHaveBeenCalledTimes(
      projectionCallCount,
    );
  });
});
