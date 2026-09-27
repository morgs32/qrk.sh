import { getAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { Async } from '@zerospin/core/async/Async';
import { UnknownAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import type { IFailure } from '@zerospin/core/contracts/failureCodec';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import {
  encodeError,
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import config from 'config';
import { and, eq } from 'drizzle-orm';
import { Effect, Result, Schema, type Semaphore } from 'effect';

import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { makeOptimisticActorDb } from '../optimistic/makeOptimisticActorDb.js';
import { readSelectedResources } from '../readSelectedResources.js';
import { resolveActorIdentity } from '../resolveActorIdentity/resolveActorIdentity.js';
import {
  commandRowInput,
  decodeRetainedAggregateCommand,
  readPendingActorCommands,
} from '../retainedCommands.js';
import { makeActorSnapshotDb } from '../validateCommands/makeActorSnapshotDb.js';

import { makeAutomationCommandId } from './makeAutomationCommandId.js';

type IReaction = Effect.Success<
  ReturnType<
    typeof aggregateActorVersionRepoDbConfig.tables.automationRuns.decodeRow
  >
>;

/** One confirmed-command gate per actor; invocations and output staging have separate recovery steps. */
export const makeActorAutomations = (props: {
  db: IDb;
  key: Parameters<typeof makeAutomationCommandId>[0]['key'];
  stageOutputs: (props: {
    commands: readonly IEncodedCommand<IAggregateCommand>[];
    executedIndex: number;
  }) => Effect.Effect<
    readonly { commandId: string; stagingFailure: IFailure | null }[],
    IAnyError,
    Async
  >;
  actorWrites?: Effect.Success<ReturnType<typeof Semaphore.make>>;
}) => {
  const { db, key, stageOutputs } = props;
  const aggregate =
    config.system.aggregates[key.aggregateName]?.[key.aggregateVersion];
  if (aggregate === undefined) {
    throw makeZerospinError('automation-aggregate-unsupported');
  }
  const actor = getAggregateActorVersion(
    { [aggregate.version]: aggregate },
    key,
  );
  const tables = aggregateActorVersionRepoDbConfig.schema;

  const readGroup = Effect.fn('ActorAutomations.readGroup')(function* (
    executedIndex: number,
  ) {
    return yield* Effect.forEach(
      db
        .select()
        .from(tables.automationRuns)
        .where(eq(tables.automationRuns.executedIndex, executedIndex))
        .orderBy(tables.automationRuns.automationName)
        .all(),
      row =>
        aggregateActorVersionRepoDbConfig.tables.automationRuns
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'automation-reaction-invalid',
              prefix: 'Invalid saved automation reaction',
            }),
          ),
    );
  });

  const getOutput = Effect.fn('ActorAutomations.getOutput')(
    function* (reference: { automationName: string; executedIndex: number }) {
      const reaction = db
        .select()
        .from(tables.automationRuns)
        .where(
          and(
            eq(tables.automationRuns.automationName, reference.automationName),
            eq(tables.automationRuns.executedIndex, reference.executedIndex),
          ),
        )
        .get();
      if (
        reaction === undefined ||
        reaction.programStatus !== 'succeeded' ||
        actor.automations[reference.automationName] === undefined
      ) {
        return yield* makeZerospinError('automation-output-not-found');
      }
      if (reaction.outputCommandRowId === null) {
        return yield* makeZerospinError('automation-output-not-found');
      }
      const row = db
        .select()
        .from(tables.commands)
        .where(eq(tables.commands.rowId, reaction.outputCommandRowId))
        .get();
      if (row === undefined) {
        return yield* makeZerospinError('automation-output-not-found');
      }
      const retained =
        yield* aggregateActorVersionRepoDbConfig.tables.commands.decodeRow(row);
      return yield* decodeRetainedAggregateCommand(retained);
    },
  );

  const capture = Effect.fn('ActorAutomations.capture')(function* (
    executedIndex: number,
  ) {
    const reactions = yield* readGroup(executedIndex);
    if (reactions.length === 0) {
      return { reactions, selected: [] as IEncodedResourceShape[] };
    }
    const pending = yield* readPendingActorCommands(db, key.aggregateVersion);
    const optimistic = yield* makeOptimisticActorDb({
      authoritativeDb: db,
      models: aggregate.models,
      pending: pending
        .filter(row => row.resolvedAt === null)
        .map(row => ({
          commandId: row.id,
          appliedAt: row.stagedAt,
          mutations: row.mutations,
        })),
    });
    const identity = yield* resolveActorIdentity({ aggregate, ...key });
    const selected = yield* readSelectedResources({
      db: optimistic.db,
      models: aggregate.models,
      selections: actor.selections,
      identity,
    });
    // A pending group can be captured again after a crash; the marker is durable
    // only once its original selected graph has been obtained under the write gate.
    yield* makeTx('ActorAutomations.startGroup')(function* (tx) {
      tx.update(tables.automationRuns)
        .set({ programStatus: 'started' })
        .where(
          and(
            eq(tables.automationRuns.executedIndex, executedIndex),
            eq(tables.automationRuns.programStatus, 'pending'),
          ),
        )
        .run();
    })(db);
    return { reactions, selected };
  });

  const runInvocation = Effect.fn('ActorAutomations.runInvocation')(
    function* (props: {
      reaction: IReaction;
      selected: readonly IEncodedResourceShape[];
    }) {
      const { reaction, selected } = props;
      const automation = actor.automations[reaction.automationName];
      if (automation === undefined) {
        return yield* makeZerospinError('automation-not-found');
      }
      const triggerRow = db
        .select()
        .from(tables.commands)
        .where(eq(tables.commands.executedIndex, reaction.executedIndex))
        .get();
      if (triggerRow === undefined) {
        return yield* makeZerospinError('automation-trigger-not-found');
      }
      const trigger = yield* decodeRetainedAggregateCommand(
        yield* aggregateActorVersionRepoDbConfig.tables.commands.decodeRow(
          triggerRow,
        ),
      );
      const executed = yield* Effect.gen(function* () {
        const scratch = yield* makeActorSnapshotDb(
          makeResourceDbConfig({ models: actor.db.models }),
        );
        for (const resource of selected) {
          const model = actor.db.models[resource.modelName];
          if (model !== undefined) {
            scratch.db.insert(model.drizzleSchema).values(resource).run();
          }
        }
        const payload = yield* decodePayload(automation.on, {
          command: trigger,
        });
        const on = yield* Schema.decodeUnknownEffect(
          UnknownAggregateCommandSchema,
        )({
          ...trigger,
          contractVersion: automation.on.version,
          payload,
        }).pipe(
          mapParseError({
            code: 'automation-input-invalid',
            prefix: 'Invalid observed command',
          }),
        );
        const context = yield* config.system.runtime.contextEffect;
        const result = yield* Effect.suspend(() =>
          automation.program({
            db: scratch.queryDb,
            on,
            contracts: Object.fromEntries(
              Object.entries(automation.contracts).map(([name, contract]) => [
                name,
                (payload: Record<string, unknown>) => ({ contract, payload }),
              ]),
            ),
          }),
        ).pipe(
          Effect.provideContext(context),
          Effect.catchDefect(defect =>
            Effect.fail(
              makeZerospinError({
                code: 'automation-program-defect',
                cause: String(defect),
              }),
            ),
          ),
        );
        if (result === null) return null;
        if (!Object.values(automation.contracts).includes(result.contract)) {
          return yield* makeZerospinError(
            'automation-output-contract-forbidden',
          );
        }
        const identity = yield* resolveActorIdentity({ aggregate, ...key });
        return {
          id: makeAutomationCommandId({
            commandId: trigger.id,
            key,
            automationName: automation.name,
          }),
          commandName: result.contract.commandName,
          contractVersion: result.contract.version,
          payload: yield* encodePayload(result.contract, {
            version: result.contract.version,
            payload: result.payload,
          }),
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          aggregateVersion: key.aggregateVersion,
          systemName: config.system.name,
          actorName: key.actorName,
          actorVersion: key.actorVersion,
          identity,
          nodeId: null,
          sessionName: null,
          nodeIndex: null,
          automationName: automation.name,
        };
      }).pipe(Effect.scoped, Effect.result);
      if (Result.isFailure(executed)) {
        const failure = yield* encodeError(makeZerospinError(executed.failure));
        const encoded = yield* Schema.encodeEffect(
          Schema.Struct({
            programFailure:
              aggregateActorVersionRepoDbConfig.tables.automationRuns.codec
                .fields.programFailure,
          }),
        )({ programFailure: failure }).pipe(
          mapParseError({
            code: 'automation-failure-invalid',
            prefix: 'Invalid automation failure',
          }),
        );
        db.update(tables.automationRuns)
          .set({ programStatus: 'failed', ...encoded })
          .where(
            and(
              eq(tables.automationRuns.executedIndex, reaction.executedIndex),
              eq(tables.automationRuns.automationName, reaction.automationName),
              eq(tables.automationRuns.programStatus, 'started'),
            ),
          )
          .run();
        return;
      }
      yield* makeTx('ActorAutomations.saveResult')(function* (tx) {
        const current = tx
          .select()
          .from(tables.automationRuns)
          .where(
            and(
              eq(tables.automationRuns.executedIndex, reaction.executedIndex),
              eq(tables.automationRuns.automationName, reaction.automationName),
            ),
          )
          .get();
        if (current?.programStatus !== 'started') return;
        let outputCommandRowId: `row_${string}` | null = null;
        if (executed.success !== null) {
          outputCommandRowId = `row_${crypto.randomUUID()}`;
          tx.insert(tables.commands)
            .values(
              yield* aggregateActorVersionRepoDbConfig.tables.commands
                .encodeRow(
                  commandRowInput({
                    rowId: outputCommandRowId,
                    command: executed.success,
                    aggregateVersion: key.aggregateVersion,
                  }),
                )
                .pipe(
                  mapParseError({
                    code: 'automation-output-encode-failed',
                    prefix: 'Invalid automation output',
                  }),
                ),
            )
            .run();
        }
        tx.update(tables.automationRuns)
          .set({
            programStatus: executed.success === null ? 'empty' : 'succeeded',
            outputCommandRowId,
          })
          .where(
            and(
              eq(tables.automationRuns.executedIndex, reaction.executedIndex),
              eq(tables.automationRuns.automationName, reaction.automationName),
              eq(tables.automationRuns.programStatus, 'started'),
            ),
          )
          .run();
      })(db);
    },
  );

  const finishGroup = Effect.fn('ActorAutomations.finishGroup')(function* (
    executedIndex: number,
  ) {
    const reactions = yield* readGroup(executedIndex);
    const outputs = yield* Effect.forEach(
      reactions.filter(reaction => reaction.programStatus === 'succeeded'),
      reaction =>
        getOutput({ automationName: reaction.automationName, executedIndex }),
    );
    const staged =
      outputs.length === 0
        ? []
        : yield* stageOutputs({ commands: outputs, executedIndex });
    yield* makeTx('ActorAutomations.finishGroupTx')(function* (tx) {
      for (const result of staged) {
        const saved = db
          .select()
          .from(tables.commands)
          .where(
            and(
              eq(tables.commands.aggregateName, key.aggregateName),
              eq(tables.commands.aggregateId, key.aggregateId),
              eq(tables.commands.id, result.commandId),
            ),
          )
          .get();
        if (saved === undefined) {
          return yield* makeZerospinError('automation-output-not-found');
        }
        const failure =
          result.stagingFailure === null
            ? null
            : yield* Schema.encodeEffect(
                aggregateActorVersionRepoDbConfig.tables.automationRuns.codec
                  .fields.stagingFailure,
              )(result.stagingFailure).pipe(
                mapParseError({
                  code: 'automation-staging-failure-invalid',
                  prefix: 'Invalid staging failure',
                }),
              );
        tx.update(tables.automationRuns)
          .set({ stagingFailure: failure })
          .where(eq(tables.automationRuns.outputCommandRowId, saved.rowId))
          .run();
      }
      tx.update(tables.automationGroups)
        .set({ status: 'staged' })
        .where(eq(tables.automationGroups.executedIndex, executedIndex))
        .run();
    })(db);
  });

  const resume = Effect.fn('ActorAutomations.resume')(function* () {
    const groups = db
      .select()
      .from(tables.automationGroups)
      .where(eq(tables.automationGroups.status, 'open'))
      .orderBy(tables.automationGroups.executedIndex)
      .all();
    for (const group of groups) {
      const reactions = yield* readGroup(group.executedIndex);
      if (reactions.some(reaction => reaction.programStatus === 'pending')) {
        const capturePending = capture(group.executedIndex).pipe(Effect.scoped);
        const captured = yield* props.actorWrites === undefined
          ? capturePending
          : props.actorWrites.withPermits(1)(capturePending);
        yield* runGroup(captured);
        continue;
      }
      db.update(tables.automationRuns)
        .set({ programStatus: 'interrupted' })
        .where(
          and(
            eq(tables.automationRuns.executedIndex, group.executedIndex),
            eq(tables.automationRuns.programStatus, 'started'),
          ),
        )
        .run();
      yield* finishGroup(group.executedIndex);
    }
  });

  const runGroup = Effect.fn('ActorAutomations.runGroup')(function* (
    captured: Effect.Success<ReturnType<typeof capture>>,
  ) {
    yield* Effect.forEach(
      captured.reactions.filter(
        reaction => reaction.programStatus === 'pending',
      ),
      reaction => runInvocation({ reaction, selected: captured.selected }),
      { concurrency: 'unbounded' },
    );
    if (captured.reactions.length > 0) {
      yield* finishGroup(captured.reactions[0]!.executedIndex);
    }
  });

  return {
    getOutput,
    initialize: Effect.sync(() => {
      if (Object.keys(actor.automations).length === 0) return;
      if (
        db
          .select()
          .from(tables.automationState)
          .where(eq(tables.automationState.id, 1))
          .get() !== undefined
      ) {
        return;
      }
      const startIndex =
        db
          .select()
          .from(tables.actorState)
          .where(eq(tables.actorState.id, 1))
          .get()?.executedIndex ?? 0;
      db.insert(tables.automationState)
        .values({ id: 1, startIndex })
        .onConflictDoNothing()
        .run();
    }),
    capture,
    runGroup,
    resume,
  };
};
