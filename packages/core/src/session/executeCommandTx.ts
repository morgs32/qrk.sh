import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Context, Schema, type Effect } from 'effect';

import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import type { makeMutations } from '../contracts/makeMutations.ts';
import type { IEncodedCommand, ISessionCommand } from '../contracts/types.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, ITx } from '../drizzle/types.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import type { IAnyModels } from '../models/types.ts';

import { SessionCommandSchema } from './AggregateFrontendCommandSchema.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import { sessionMetadataDrizzleSchema } from './sessionRepoTables.ts';
import type {
  IFrontendDelta,
  IInitializedSessionState,
  ISessionId,
} from './types.ts';

export class Db extends Context.Service<Db, IDb>()(
  'core/src/session/makeAggregateSession/Db',
) {
  static readonly Tx = Context.Service<
    'core/src/session/makeAggregateSession/Db.Tx',
    ITx
  >('core/src/session/makeAggregateSession/Db.Tx');
}

/** Commit one local command occurrence, its optimistic mutations, and the next session position together. */
export const executeCommandTx = makeTx(
  'executeCommandTx',
  Db,
)(function* <
  COMMAND extends ISessionCommand & Readonly<{ pushIndex: null }>,
>(props: {
  sessionId: ISessionId;
  madeMutations:
    | { failure: IAnyError }
    | { success: Effect.Success<ReturnType<typeof makeMutations>> };
  encodedCommand: IEncodedCommand<COMMAND>;
  chainedAt: Date;
  state: Pick<
    IInitializedSessionState<IAnyModels>,
    'aggregateIndex' | 'userIndex' | 'pushIndex'
  >;
  command: COMMAND;
}) {
  const {
    sessionId,
    madeMutations,
    encodedCommand,
    chainedAt,
    state,
    command,
  } = props;

  const tx = yield* Db.Tx;
  const metadata = tx
    .select()
    .from(sessionMetadataDrizzleSchema)
    .where(eq(sessionMetadataDrizzleSchema.sessionId, sessionId))
    .get();
  const sessionIndex = metadata?.nextSessionIndex ?? 1;
  const nextSessionIndex = sessionIndex + 1;
  if (
    !Number.isSafeInteger(sessionIndex) ||
    sessionIndex < 1 ||
    !Number.isSafeInteger(nextSessionIndex)
  ) {
    return yield* new ZerospinError({
      code: 'session-index-invalid',
      message: 'The durable next session index is invalid',
      extra: { sessionIndex },
    });
  }

  if ('failure' in madeMutations) {
    const failure = yield* Schema.encodeUnknownEffect(ZerospinError.schema)(
      madeMutations.failure,
    ).pipe(
      mapParseError({
        code: 'session-command-failure-encode-failed',
        prefix: 'Failed to encode locally terminal command failure',
      }),
    );
    const delta = {
      inserted: [],
      updated: [],
      deleted: [],
      mutations: [],
    } satisfies IFrontendDelta;
    const encodedOccurrence = {
      ...encodedCommand,
      sessionIndex,
      chainedAt,
      delta,
      failedAt: chainedAt,
      failure,
    };
    const commandBytes = yield* Schema.encodeEffect(
      Schema.fromJsonString(SessionCommandSchema),
    )(encodedOccurrence).pipe(
      mapParseError({
        code: 'session-command-encode-failed',
        prefix: 'Failed to encode locally terminal command',
      }),
    );

    tx.insert(sessionCommandJournalDrizzleSchema)
      .values({
        ...encodedCommand,
        sessionIndex,
        command: commandBytes,
      })
      .run();
    tx.insert(sessionMetadataDrizzleSchema)
      .values({
        sessionId,
        nextSessionIndex,
        aggregateIndex: state.aggregateIndex,
        userIndex: state.userIndex,
        pushIndex: state.pushIndex,
      })
      .onConflictDoUpdate({
        target: sessionMetadataDrizzleSchema.sessionId,
        set: { nextSessionIndex },
      })
      .run();

    return {
      command: {
        ...command,
        sessionIndex,
        chainedAt,
        delta,
        failedAt: chainedAt,
        failure,
      },
      encodedCommand: encodedOccurrence,
    };
  }

  const encodedMutations = [];
  const inserted = new Map<
    string,
    (typeof madeMutations.success.mutations)[number]['model']
  >();
  const updated = new Map<
    string,
    (typeof madeMutations.success.mutations)[number]['model']
  >();
  const deleted = new Map<
    string,
    Readonly<{ id: string; modelName: string }>
  >();

  for (const [
    mutationIndex,
    mutation,
  ] of madeMutations.success.mutations.entries()) {
    const appliedMutation = yield* applyAggregateFrontendMutationTx({
      tx,
      mutation,
      commandId: command.id,
      mutationIndex,
      appliedAt: chainedAt,
    });
    const encodedMutation = yield* encodeAppliedMutation({
      mutation: appliedMutation,
    });
    encodedMutations.push(encodedMutation);
    const key = `${mutation.model.modelName}\u0000${mutation.resourceId}`;
    if (mutation.operationName === 'delete') {
      if (inserted.delete(key)) {
        updated.delete(key);
        deleted.delete(key);
      } else {
        updated.delete(key);
        deleted.set(key, {
          id: mutation.resourceId,
          modelName: mutation.model.modelName,
        });
      }
    } else if (
      mutation.operationName === 'create' ||
      (mutation.operationName === 'replicate' &&
        appliedMutation.inverseOperation === null)
    ) {
      inserted.set(key, mutation.model);
      updated.delete(key);
      deleted.delete(key);
    } else if (!inserted.has(key)) {
      updated.set(key, mutation.model);
      deleted.delete(key);
    }
  }

  const insertedResources = [];
  for (const [key, model] of inserted) {
    const id = key.slice(key.indexOf('\u0000') + 1);
    const row = tx
      .select()
      .from(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, id))
      .get();
    if (row === undefined) continue;
    insertedResources.push(
      yield* Schema.decodeUnknownEffect(Schema.toType(EncodedResourceSchema))(
        row,
      ).pipe(
        mapParseError({
          code: 'session-resource-encode-failed',
          prefix: `Failed to encode session resource ${model.modelName}.${id}`,
        }),
      ),
    );
  }
  const updatedResources = [];
  for (const [key, model] of updated) {
    const id = key.slice(key.indexOf('\u0000') + 1);
    const row = tx
      .select()
      .from(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, id))
      .get();
    if (row === undefined) continue;
    updatedResources.push(
      yield* Schema.decodeUnknownEffect(Schema.toType(EncodedResourceSchema))(
        row,
      ).pipe(
        mapParseError({
          code: 'session-resource-encode-failed',
          prefix: `Failed to encode session resource ${model.modelName}.${id}`,
        }),
      ),
    );
  }

  const delta = {
    inserted: insertedResources,
    updated: updatedResources,
    deleted: [...deleted.values()],
    mutations: encodedMutations,
  } satisfies IFrontendDelta;
  const encodedOccurrence = {
    ...encodedCommand,
    sessionIndex,
    chainedAt,
    delta,
    failedAt: null,
    failure: null,
  };
  const commandBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(SessionCommandSchema),
  )(encodedOccurrence).pipe(
    mapParseError({
      code: 'session-command-encode-failed',
      prefix: 'Failed to encode locally terminal command',
    }),
  );

  tx.insert(sessionCommandJournalDrizzleSchema)
    .values({
      ...encodedCommand,
      sessionIndex,
      command: commandBytes,
    })
    .run();
  const encodedMutationJson = yield* Schema.encodeEffect(
    Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
  )(encodedMutations).pipe(
    mapParseError({
      code: 'session-optimistic-mutations-encode-failed',
      prefix: 'Failed to encode optimistic session mutations',
    }),
  );
  tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
    .values({ commandId: command.id, mutations: encodedMutationJson })
    .onConflictDoUpdate({
      target: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
      set: { mutations: sql`excluded.mutations` },
    })
    .run();
  tx.insert(sessionMetadataDrizzleSchema)
    .values({
      sessionId,
      nextSessionIndex,
      aggregateIndex: state.aggregateIndex,
      userIndex: state.userIndex,
      pushIndex: state.pushIndex,
    })
    .onConflictDoUpdate({
      target: sessionMetadataDrizzleSchema.sessionId,
      set: { nextSessionIndex },
    })
    .run();

  return {
    command: {
      ...command,
      sessionIndex,
      chainedAt,
      delta,
      failedAt: null,
      failure: null,
    },
    encodedCommand: encodedOccurrence,
  };
});
