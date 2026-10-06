import assert from 'node:assert/strict';

import { AggregateBrowserCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import {
  AggregateTerminalCommandSchema,
  EncodedAggregateCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { DurableObject } from 'cloudflare:workers';
import { eq, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import { aggregateActorVersionChainDbConfig } from '../AggregateActorVersionChain/aggregateActorVersionChainDbConfig.js';
import { receiveBrowserCommands } from '../AggregateActorVersionChain/receiveBrowserCommands/receiveBrowserCommands.js';
import { aggregateActorVersionRepoDbConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.js';
import { applyExecutedCommands } from '../AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommands.js';
import { getSnapshot } from '../AggregateActorVersionRepo/getSnapshot/getSnapshot.js';
import { makeOptimisticActorDb } from '../AggregateActorVersionRepo/optimistic/makeOptimisticActorDb.js';
import { makeStagedAggregateCommandOutbox } from '../AggregateActorVersionRepo/optimistic/makeStagedAggregateCommandOutbox.js';
import {
  stageActorCommands,
  stageActorCommandsWithRetry,
} from '../AggregateActorVersionRepo/optimistic/stageActorCommands.js';
import { readSelectedResources } from '../AggregateActorVersionRepo/readSelectedResources.js';
import { readPendingActorCommands } from '../AggregateActorVersionRepo/retainedCommands.js';
import { admitCommandsTx } from '../AggregateChain/admitCommands/admitCommandsTx.js';
import { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { aggregateChainFixedDORepoConfig } from '../AggregateChain/aggregateChainFixedDORepoConfig.js';
import { aggregateVersionChainDbConfig } from '../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeDurableDb } from '../makeDORepo/makeDurableDb.js';

import fixtureConfig, {
  actor,
  aggregate,
  stagingCalls,
  stagingKey,
} from './actorStagingConfig.js';
import { runFixture } from './runFixture.js';

const runtime = fixtureConfig.system.runtime;
const actorConfig = makeResourceDbConfig({
  models: aggregate.models,
  otherTables: aggregateActorVersionRepoDbConfig.tables,
});
const tables = aggregateActorVersionRepoDbConfig.schema;
type IEnv = {
  ACTOR_STAGING: DurableObjectNamespace<ActorStaging>;
  AGGREGATE_CHAIN: DurableObjectNamespace<StagingAdmission>;
  AGGREGATE_VERSION_REPO: DurableObjectNamespace<StagingSnapshotOwner>;
  AGGREGATE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<StagingPublication>;
};
const succeeded = {
  status: 'succeeded' as const,
  startedAt: new Date(0),
  completedAt: new Date(1),
};

/** Production staging/reconstruction/projection run against disposable Durable Object SQLite. */
export class ActorStaging extends DurableObject<IEnv> {
  override async alarm() {
    const scenario = await this.ctx.storage.get<string>('scenario');
    assert.ok(scenario);
    await this.fetch(new Request(`http://fixture/${scenario}/drain`));
  }
  override async fetch(request: Request) {
    const [, scenario = 'main', action = 'read'] = new URL(
      request.url,
    ).pathname.split('/');
    const key = { ...stagingKey, aggregateId: `acct_${scenario}` };
    await this.ctx.storage.put('scenario', scenario);
    const env = this.env;
    const db = makeDurableDb({
      storage: this.ctx.storage,
      dbConfig: actorConfig,
    });
    const run = <A, E>(effect: Effect.Effect<A, E, unknown>) =>
      runFixture(runtime, effect.pipe(Effect.scoped)).catch(error => {
        console.error(error, error instanceof Error ? error.cause : undefined);
        return Promise.reject(error);
      });
    if (
      this.ctx.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE name = 'item'")
        .toArray().length === 0
    ) {
      await run(provisionDb({ db, schema: actorConfig.schema }));
      db.transaction(tx => {
        const base = {
          version: '1.0.0',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        tx.insert(actorConfig.schema.bucket)
          .values([
            { ...base, id: 'bkt_visible', modelName: 'bucket', active: true },
            { ...base, id: 'bkt_hidden', modelName: 'bucket', active: false },
          ])
          .run();
        tx.insert(actorConfig.schema.item)
          .values([
            {
              ...base,
              id: 'itm_one',
              modelName: 'item',
              name: 'confirmed',
              amount: 1,
              bucketId: 'bkt_visible',
            },
            {
              ...base,
              id: 'itm_hidden',
              modelName: 'item',
              name: 'hidden',
              amount: 5,
              bucketId: 'bkt_hidden',
            },
          ])
          .run();
      });
    }
    const command = (
      id: `cmd_${string}`,
      amount: number,
      expected: number,
      create = false,
      active = true,
    ): IEncodedCommand<IAggregateCommand> => ({
      id,
      commandName: 'change',
      contractVersion: '1.0.0',
      payload: JSON.stringify({ amount, expected, create, active }),
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      aggregateVersion: key.aggregateVersion,
      systemName: 'fixture',
      actorName: key.actorName,
      actorVersion: key.actorVersion,
      claims: { aggregateId: key.aggregateId },
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
    });
    const stage = (commands: readonly IEncodedCommand<IAggregateCommand>[]) =>
      stageActorCommands({ db, key, commands });
    let result: unknown = null;
    if (action === 'stage') {
      result = await run(
        stage([
          command('cmd_first', 2, 1, true),
          command('cmd_rejected', 3, 999),
          command('cmd_second', 4, 2),
        ]),
      );
    }
    if (action === 'duplicate') {
      result = await run(stage([command('cmd_first', 2, 1, true)]));
    }
    if (action === 'conflict') {
      const conflict = await run(
        stage([command('cmd_first', 99, 1, true)]).pipe(Effect.result),
      );
      assert.ok(Result.isFailure(conflict));
      result = { _tag: 'Failure', failure: String(conflict.failure) };
    }
    if (action === 'concurrent') {
      result = await run(
        Effect.all(
          [
            stageActorCommandsWithRetry({
              db,
              key,
              commands: [command('cmd_concurrent', 2, 1)],
            }),
            stageActorCommandsWithRetry({
              db,
              key,
              commands: [command('cmd_concurrent', 2, 1)],
            }),
          ],
          { concurrency: 'unbounded' },
        ),
      );
    }
    if (action === 'commit-failure') {
      db.run(
        sql.raw(
          "CREATE TRIGGER fail_stage BEFORE INSERT ON stagedAggregateCommandOutbox BEGIN SELECT RAISE(ABORT, 'injected staging failure'); END",
        ),
      );
      result = await run(
        stage([command('cmd_failed_commit', 2, 1, true)]).pipe(Effect.exit),
      );
      db.run(sql.raw('DROP TRIGGER fail_stage'));
      assert.equal(Reflect.get(result!, '_tag'), 'Failure');
      result = { _tag: 'Failure' };
    }
    if (action === 'stage-rejected-admission') {
      result = await run(stage([command('cmd_admission_rejected', 99, 1)]));
    }
    if (action === 'admit-before-restart') {
      const name = await run(
        aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
      );
      const pending = await run(
        readPendingActorCommands(db, key.aggregateVersion),
      );
      const first = pending[0];
      assert.ok(first);
      const saved = Schema.decodeUnknownSync(
        Schema.toType(EncodedAggregateCommandSchema),
      )(first);
      result = await this.env.AGGREGATE_CHAIN.getByName(name).admitCommands({
        commands: [saved],
      });
    }
    if (action === 'drain') {
      const queue = makeStagedAggregateCommandOutbox({
        db,
        key,
        alarmRegistry: makeAlarmRegistry({ storage: this.ctx.storage }),
      });
      await run(queue.drain());
    }
    if (action === 'rebase') {
      db.update(actorConfig.schema.item)
        .set({ name: 'new-confirmed', amount: 10 })
        .where(eq(actorConfig.schema.item.id, 'itm_one'))
        .run();
    }
    if (action === 'missing-row') {
      db.delete(actorConfig.schema.item)
        .where(eq(actorConfig.schema.item.id, 'itm_one'))
        .run();
    }
    if (
      action === 'project' ||
      action === 'execution-rejected' ||
      action === 'projection-failure'
    ) {
      const pending = await run(
        readPendingActorCommands(db, key.aggregateVersion),
      );
      const first = pending[0];
      assert.ok(first);
      const failure = {
        _tag: 'ZerospinError' as const,
        code: 'aggregate-rejected',
        message: 'Rejected',
        status: 400,
        extra: null,
      };
      const execution =
        action === 'execution-rejected'
          ? {
              status: 'failed' as const,
              contractVersion: '1.0.0',
              startedAt: new Date(1),
              completedAt: new Date(2),
              failure,
            }
          : {
              status: 'succeeded' as const,
              contractVersion: '1.0.0',
              startedAt: new Date(1),
              completedAt: new Date(2),
              result: null,
            };
      const terminal = Schema.decodeUnknownSync(
        Schema.toType(AggregateTerminalCommandSchema),
      )({
        ...first,
        aggregateIndex: 1,
        admission: succeeded,
        execution,
        dispositionHash: '0'.repeat(64),
      });
      const row = await run(
        aggregateVersionChainDbConfig.tables.aggregateCommands.encodeRow({
          ...terminal,
          response: terminal.response ?? null,
          aggregateVersion: key.aggregateVersion,
          executedIndex: 1,
          executionVersion: '1.0.0',
          originalExecutionVersion: '1.0.0',
        }),
      );
      const delivery = {
        kind: 'command' as const,
        executedIndex: 1,
        command: row,
        operations:
          action === 'execution-rejected'
            ? []
            : first.operations.map(operation => ({
                ...operation,
                executedIndex: 1,
                committedAt: new Date(2),
              })),
      };
      if (action === 'projection-failure') {
        db.run(
          sql.raw(
            "CREATE TRIGGER fail_projection BEFORE INSERT ON browserCommandOutbox BEGIN SELECT RAISE(ABORT, 'injected projection failure'); END",
          ),
        );
        const failed = await run(
          applyExecutedCommands({ db, key, rows: [delivery] }).pipe(
            Effect.exit,
          ),
        );
        assert.equal(failed._tag, 'Failure');
        db.run(sql.raw('DROP TRIGGER fail_projection'));
      } else {
        await run(applyExecutedCommands({ db, key, rows: [delivery] }));
        const before = db.select().from(tables.browserCommandOutbox).all();
        await run(applyExecutedCommands({ db, key, rows: [delivery] }));
        assert.deepEqual(
          db.select().from(tables.browserCommandOutbox).all(),
          before,
          'duplicate terminal delivery does not publish twice',
        );
      }
    }
    if (action === 'snapshot') {
      result = await run(
        getSnapshot({
          db,
          key,
          requested: {
            ...key,
            claims: { aggregateId: key.aggregateId },
            nodeId: null,
            sessionName: 'fixture',
          },
          subscriber: {
            catchup: () =>
              runtime.runPromise(Effect.void.pipe(makeRpcEnvelope)),
          },
          browserCommandOutbox: {
            drain: () =>
              Effect.gen(function* () {
                const rows = db
                  .select()
                  .from(tables.browserCommandOutbox)
                  .all();
                const publication =
                  env.AGGREGATE_ACTOR_VERSION_CHAIN.getByName('fixture');
                yield* Effect.promise(() => publication.receive(rows));
                db.delete(tables.browserCommandOutbox).run();
              }).pipe(Effect.as(undefined)),
          },
        }),
      );
    }
    const pending = await run(
      readPendingActorCommands(db, key.aggregateVersion),
    );
    const optimistic = await run(
      Effect.gen(function* () {
        const scratch = yield* makeOptimisticActorDb({
          authoritativeDb: db,
          models: aggregate.models,
          pending: pending
            .filter(row => row.resolvedAt === null)
            .map(row => ({
              commandId: row.id,
              appliedAt: row.stagedAt,
              operations: row.operations,
            })),
        });
        return {
          resources: scratch.db.select().from(actorConfig.schema.item).all(),
          selected: yield* readSelectedResources({
            db: scratch.db,
            models: aggregate.models,
            selections: actor.capturedSelections,
            identity: {},
          }),
          unapplied: scratch.unappliedCommandIds,
        };
      }),
    );
    const name = await run(
      aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
    );
    const admissions = await env.AGGREGATE_CHAIN.getByName(name).status();
    return Response.json({
      result,
      admissions,
      resources: db.select().from(actorConfig.schema.item).all(),
      pending,
      optimistic,
      commands: db.select().from(tables.commands).all(),
      outbox: db.select().from(tables.stagedAggregateCommandOutbox).all(),
      publications: db.select().from(tables.browserCommandOutbox).all(),
      state: db.select().from(tables.actorState).all(),
      calls: { ...stagingCalls },
    });
  }
}

/** The receiver uses real AC retention; one case returns a terminal admission refusal. */
export class StagingAdmission extends DurableObject<IEnv> {
  async admitCommands(props: {
    commands: readonly IEncodedCommand<IAggregateCommand>[];
  }) {
    const db = makeDurableDb({
      storage: this.ctx.storage,
      dbConfig: aggregateChainDbConfig,
    });
    await runFixture(
      runtime,
      provisionDb({ db, schema: aggregateChainDbConfig.schema }),
    );
    return runtime.runPromise(
      Effect.gen(function* () {
        if (
          props.commands.some(
            command => command.id === 'cmd_admission_rejected',
          )
        ) {
          return yield* makeZerospinError('admission-contract-not-found');
        }
        return yield* admitCommandsTx(
          db,
          props.commands.map(command => ({
            command,
            admission: succeeded,
            originalExecutionVersion: '1.0.0',
          })),
        );
      }).pipe(makeRpcEnvelope),
    );
  }
  async status() {
    const db = makeDurableDb({
      storage: this.ctx.storage,
      dbConfig: aggregateChainDbConfig,
    });
    await runFixture(
      runtime,
      provisionDb({ db, schema: aggregateChainDbConfig.schema }),
    );
    return db.select().from(aggregateChainDbConfig.schema.commands).all();
  }
}

/** Snapshot network seams stay outside the actor capture transaction. */
export class StagingSnapshotOwner extends DurableObject<IEnv> {
  catchupMaterialization() {
    return runtime.runPromise(Effect.succeed(0).pipe(makeRpcEnvelope));
  }
}
export class StagingPublication extends DurableObject<IEnv> {
  async receive(
    rows: readonly (typeof tables.browserCommandOutbox.$inferSelect)[],
  ) {
    const db = makeDurableDb({
      storage: this.ctx.storage,
      dbConfig: aggregateActorVersionChainDbConfig,
    });
    await runFixture(
      runtime,
      provisionDb({ db, schema: aggregateActorVersionChainDbConfig.schema }),
    );
    await runFixture(
      runtime,
      receiveBrowserCommands({
        db,
        rows,
        broadcast: ({ output }) => {
          const wire = Schema.encodeSync(AggregateBrowserCommandSchema)(output);
          for (const resource of output.delta.upserted) {
            assert.ok(resource.createdAt instanceof Date);
          }
          for (const resource of wire.delta.upserted) {
            assert.equal(typeof resource.createdAt, 'string');
          }
        },
      }),
    ).catch(error => {
      console.error(error, error instanceof Error ? error.cause : undefined);
      return Promise.reject(error);
    });
  }
}

export const stagingWorker = {
  fetch(request: Request, env: IEnv) {
    const scenario = new URL(request.url).pathname.split('/')[1] ?? 'main';
    return env.ACTOR_STAGING.getByName(scenario).fetch(request);
  },
};
