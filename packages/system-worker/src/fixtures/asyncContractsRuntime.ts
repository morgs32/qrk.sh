import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
/* oxlint-disable react-hooks/rules-of-hooks -- Effect Context service use is not a React hook. */
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeExternalContract } from '@zerospin/core/contracts/make/makeExternalContract';
import { makeOperations } from '@zerospin/core/contracts/make/makeOperations';
import { mapContractVersion } from '@zerospin/core/contracts/make/mapContractVersion';
import { prepareContractInput } from '@zerospin/core/contracts/prepareContractInput';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { DurableObject } from 'cloudflare:workers';
import { Context, Effect, Layer, ManagedRuntime, Schema, Tuple } from 'effect';

import { admitCommandsTx } from '../AggregateChain/admitCommands/admitCommandsTx.js';
import { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { genesisDispositionHash } from '../aggregateDispositionHash/aggregateDispositionHash.js';
import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { executeCommandsTx } from '../AggregateVersionRepo/executeCommands/executeCommandsTx.js';
import { asyncOperationsDbConfig } from '../asyncOperations/asyncOperationsDbConfig.js';
import { makeAsyncOperations } from '../asyncOperations/makeAsyncOperations.js';
import {
  makePreparedAggregateCommand,
  readPreparedAggregateAsyncWork,
  resolveWorkContract,
} from '../asyncOperations/readPreparedAsyncCommand.js';
import { makeAlarmRegistry } from '../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeDurableDb } from '../makeDORepo/makeDurableDb.js';
import { makeOutboxQueue } from '../makeOutboxQueue/makeOutboxQueue.js';

import { runFixture } from './runFixture.js';

type IEnv = {
  OWNER: DurableObjectNamespace<AsyncOwner>;
  CHAIN: DurableObjectNamespace<AsyncChain>;
  PROVIDER: DurableObjectNamespace<AsyncProvider>;
  PAUSE_AT: string;
};
class ObservationProvider extends Context.Service<
  ObservationProvider,
  { observe(intent: string): Effect.Effect<{ receipt: string }> }
>()('ObservationProvider') {}
const begin = makeContractVersion(defineContract('begin'), {
  version: '1.0.0',
  payload: { intent: primitives.text() },
  result: Schema.Struct({ intent: Schema.String }),
  program: ({ payload }) => Effect.succeed(payload),
});
const apply = makeExternalContract({
  name: 'asyncApply',
  version: '1.0.0',
  payload: { intent: primitives.text() },
  external: {
    response: Schema.Struct({ receipt: Schema.String }),
    timeoutMs: 500,
    retryDelayMs: 100,
    request: ({ payload }) =>
      ObservationProvider.use(provider => provider.observe(payload.intent)),
  },
  result: Schema.String,
  program: ({ response }) => Effect.succeed(response.receipt),
});
const mappedBegin = mapContractVersion({
  contractVersion: begin,
  operations: { models: {}, contracts: { asyncApply: apply } },
  result: Schema.Struct({ intent: Schema.String }),
  program: ({ command, operations }) =>
    Effect.gen(function* () {
      yield* operations.contracts.asyncApply(command.payload);
      return command.result;
    }),
});
const actor = makeAggregateActorVersion(
  { name: 'operator' },
  {
    version: '1.0.0',
    authentication: 'none',
    identity: makeActorIdentity({
      claims: Schema.Struct({ aggregateId: Schema.String }),
      actorPath: RoutePattern.parse('/'),
    }),
    db: makeActorDbVersion({ models: {} }),
    selections: {},
    contracts: { begin: mappedBegin, asyncApply: apply },
  },
);
const aggregate = makeAggregateVersion(
  { name: 'fixture' },
  {
    version: '1.0.0',
    models: {},
    contracts: { begin: mappedBegin, asyncApply: apply },
    actors: { operator: actor },
  },
);
const key = {
  systemId: 'sys_fixture',
  aggregateId: 'acct_fixture',
  aggregateName: 'fixture',
  aggregateVersion: '1.0.0',
};
const admission = {
  status: 'succeeded' as const,
  startedAt: new Date(0),
  completedAt: new Date(0),
};
const runtimeLayer = AsyncLive;
const runtime = ManagedRuntime.make(runtimeLayer);

export class AsyncProvider extends DurableObject<IEnv> {
  observe(intent: string) {
    // A fixture provider reconciles the immutable intent; production providers own their idempotency policy.
    return this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS observations (intent TEXT PRIMARY KEY, calls INTEGER NOT NULL, receipt TEXT NOT NULL)',
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO observations VALUES (?, 1, ?) ON CONFLICT(intent) DO UPDATE SET calls = calls + 1',
        intent,
        `receipt:${intent}`,
      );
      return { receipt: `receipt:${intent}` };
    });
  }
  status() {
    return this.ctx.storage.sql
      .exec<{ intent: string; calls: number; receipt: string }>(
        'SELECT * FROM observations',
      )
      .toArray();
  }
}

const admittedSchema = Schema.Array(
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        aggregateIndex: Schema.Number,
        originalExecutionVersion: Schema.String,
        admission: Schema.toType(
          Schema.Union([
            AdmissionResultSchema.members[1],
            AdmissionResultSchema.members[2],
          ]),
        ),
      }),
    ),
  ),
);

export class AsyncChain extends DurableObject<IEnv> {
  readonly db = makeDurableDb({
    storage: this.ctx.storage,
    dbConfig: aggregateChainDbConfig,
  });
  constructor(ctx: DurableObjectState, env: IEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() =>
      runFixture(
        runtime,
        provisionDb({ db: this.db, schema: aggregateChainDbConfig.schema }),
      ),
    );
  }
  admit(
    command: Parameters<typeof admitCommandsTx>[1][number]['command'],
  ): Promise<Effect.Success<ReturnType<typeof admitCommandsTx>>> {
    return runFixture(
      runtime,
      admitCommandsTx(this.db, [
        { command, admission, originalExecutionVersion: key.aggregateVersion },
      ]),
    );
  }
  status() {
    return this.db
      .select()
      .from(aggregateChainDbConfig.schema.commands)
      .all()
      .map(row => ({
        id: row.id,
        commandName: row.commandName,
        aggregateIndex: row.aggregateIndex,
      }));
  }
}

export class AsyncOwner extends DurableObject<IEnv> {
  readonly db = makeDurableDb({
    storage: this.ctx.storage,
    dbConfig: aggregateVersionRepoDbConfig,
  });
  readonly alarms = makeAlarmRegistry({ storage: this.ctx.storage });
  readonly executionLayer = Layer.mergeAll(
    AsyncLive,
    Layer.succeed(ObservationProvider, {
      observe: intent =>
        Effect.promise(async () => {
          const observed =
            await this.env.PROVIDER.getByName('fixture').observe(intent);
          const result = { receipt: observed.receipt };
          observed[Symbol.dispose]();
          return result;
        }).pipe(
          Effect.andThen(result =>
            this.env.PAUSE_AT === 'provider'
              ? Effect.never
              : Effect.succeed(result),
          ),
        ),
    }),
  );
  readonly executionRuntime = ManagedRuntime.make(this.executionLayer);
  readonly outbox = makeOutboxQueue({
    name: 'asyncCommandOutbox',
    db: this.db,
    outboxTable: asyncOperationsDbConfig.schema.asyncCommandOutbox,
    indexColumnName: 'outboxIndex',
    alarmRegistry: this.alarms,
    deliver: rows =>
      Effect.gen({ self: this }, function* () {
        if (this.env.PAUSE_AT === 'record') return yield* Effect.never;
        for (const row of rows) {
          const work = yield* readPreparedAggregateAsyncWork(
            this.db,
            row.asyncCommandId,
          );
          const command = yield* makePreparedAggregateCommand(work, apply, key);
          const admitted = yield* Effect.promise(async () =>
            Schema.decodeUnknownSync(admittedSchema)(
              await this.env.CHAIN.getByName('fixture').admit(command),
            ),
          );
          if (this.env.PAUSE_AT === 'admission') return yield* Effect.never;
          const retained = admitted[0];
          if (retained === undefined) {
            return yield* makeZerospinError('fixture-admission-missing');
          }
          const head = this.db
            .select()
            .from(aggregateVersionRepoDbConfig.schema.head)
            .get();
          if (
            head !== undefined &&
            head.aggregateIndex >= retained.aggregateIndex
          ) {
            continue;
          }
          const output = yield* Effect.promise(() =>
            runFixture(
              this.executionRuntime,
              Effect.gen({ self: this }, function* () {
                const input = yield* prepareContractInput({
                  contract: apply,
                  command: { ...command, payload: work.payload },
                  claims: work.claims,
                });
                const made = yield* makeOperations({
                  contract: apply,
                  db: this.db,
                  models: {},
                  command: { ...command },
                  input,
                });
                return { ...made, input };
              }),
            ),
          );
          yield* Effect.promise(() =>
            runFixture(
              this.executionRuntime,
              executeCommandsTx(this.db, {
                head,
                key,
                aggregate,
                preparedPage: [
                  {
                    command: {
                      ...retained,
                      execution: { status: 'pending' },
                      dispositionHash: null,
                    },
                    startedAt: new Date(),
                    originalExecutionVersion: key.aggregateVersion,
                    contract: apply,
                    payload: output.input.payload,
                    contractVersion: apply.version,
                    encodedResult: output.encodedResult,
                    operations: [],
                    failure: null,
                    guard: () => Effect.void,
                  },
                ],
              }),
            ),
          );
        }
      }),
  });
  readonly work = makeAsyncOperations({
    db: this.db,
    alarms: this.alarms,
    resolve: work => resolveWorkContract(aggregate, work),
    run: effect => runFixture(this.executionRuntime, effect),
    background: promise => this.ctx.waitUntil(promise),
    deliver: () => this.outbox.drain(),
  });
  constructor(ctx: DurableObjectState, env: IEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      await runFixture(
        runtime,
        provisionDb({
          db: this.db,
          schema: aggregateVersionRepoDbConfig.schema,
        }),
      );
      if (
        this.db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.head)
          .get() === undefined
      ) {
        this.db
          .insert(aggregateVersionRepoDbConfig.schema.head)
          .values({
            singletonId: 1,
            aggregateIndex: 0,
            executedIndex: 0,
            dispositionHash: genesisDispositionHash(),
          })
          .run();
      }
      if (env.PAUSE_AT === 'source') {
        this.alarms.register('paused', this.alarms.hold('paused'));
      } else {
        await runFixture(this.executionRuntime, this.work.recover());
      }
    });
  }
  override async alarm() {
    await runFixture(this.executionRuntime, this.alarms.run());
  }
  async start() {
    const command = {
      id: 'cmd_source' as const,
      commandName: begin.commandName,
      contractVersion: begin.version,
      payload: '{"intent":"restart"}',
      ...key,
      systemName: 'fixture',
      actorName: actor.name,
      actorVersion: actor.version,
      claims: { aggregateId: key.aggregateId },
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
      response: null,
    };
    const retained = Schema.decodeUnknownSync(admittedSchema)(
      await this.env.CHAIN.getByName('fixture').admit(command),
    )[0];
    if (retained === undefined) throw new Error('Source admission missing');
    await runFixture(this.executionRuntime, this.work.arm);
    await runFixture(
      runtime,
      executeCommandsTx(this.db, {
        head: this.db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.head)
          .get(),
        key,
        aggregate,
        preparedPage: [
          {
            command: {
              ...retained,
              execution: { status: 'pending' },
              dispositionHash: null,
            },
            startedAt: new Date(),
            originalExecutionVersion: key.aggregateVersion,
            contract: begin,
            payload: { intent: 'restart' },
            contractVersion: begin.version,
            encodedResult: { intent: 'restart' },
            operations: [
              {
                operationName: 'async',
                contract: apply,
                payload: { intent: 'restart' },
                commandId: command.id,
                operationIndex: 0,
              },
            ],
            failure: null,
            guard: () => Effect.void,
          },
        ],
      }),
    );
    if (this.env.PAUSE_AT !== 'source') {
      await runFixture(this.executionRuntime, this.work.recover());
    }
    return this.status();
  }
  status() {
    return {
      work: this.db
        .select()
        .from(asyncOperationsDbConfig.schema.asyncOperations)
        .all(),
      outbox: this.db
        .select()
        .from(asyncOperationsDbConfig.schema.asyncCommandOutbox)
        .all(),
      commands: this.db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.executedCommandOutbox)
        .all()
        .map(row => ({
          id: row.id,
          commandName: row.commandName,
          execution: JSON.parse(row.execution),
        })),
      head: this.db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.head)
        .get(),
    };
  }
}

// oxlint-disable-next-line import/no-default-export -- Wrangler fixture entry point.
export default {
  async fetch(request: Request, env: IEnv) {
    const path = new URL(request.url).pathname;
    const owner = env.OWNER.getByName('fixture');
    if (path === '/start') return Response.json(await owner.start());
    const state = await owner.status();
    const chain = await env.CHAIN.getByName('fixture').status();
    const provider =
      state.work.length === 0 || env.PAUSE_AT === 'source'
        ? []
        : await env.PROVIDER.getByName('fixture')
            .status()
            .catch(() => []);
    return Response.json({ ready: true, ...state, chain, provider });
  },
};
