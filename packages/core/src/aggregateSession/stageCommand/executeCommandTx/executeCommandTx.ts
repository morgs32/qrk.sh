import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyAggregateSessionMutationTx } from '../../../contracts/applyAggregateSessionMutationTx.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../../../contracts/encodeAppliedMutation.ts';
import type { makeMutations } from '../../../contracts/make/makeMutations.ts';
import type {
  IEncodedCommand,
  ISessionCommandInput,
} from '../../../contracts/types.ts';
import { makeTx } from '../../../drizzle/make/makeTx.ts';
import type { ITx } from '../../../drizzle/types.ts';
import { EncodedResourceSchema } from '../../../models/EncodedResourceSchema.ts';
import type { IAnyModels } from '../../../models/types.ts';
import { dutils } from '../../../utils/dutils.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import type { IInitializedSessionState, ISessionId } from '../../types.ts';

/** Commit one complete local occurrence and its next position; only live execution retains pending optimism. */
export const executeCommandTx = makeTx('executeCommandTx')(function* <
  COMMAND extends ISessionCommandInput & Readonly<{ pushIndex: null }>,
>(
  tx: ITx,
  props: {
    settleLocally?: boolean;
    sessionId: ISessionId;
    madeMutations: Effect.Success<ReturnType<typeof makeMutations>>;
    encodedCommand: IEncodedCommand<COMMAND>;
    startedAt: Date;
    state: Pick<
      IInitializedSessionState<IAnyModels>,
      'aggregateIndex' | 'executedIndex' | 'executedHash' | 'pushIndex'
    >;
    command: COMMAND;
  },
) {
  const {
    sessionId,
    madeMutations,
    encodedCommand,
    startedAt,
    state,
    command,
    settleLocally,
  } = props;

  const metadata = tx
    .select()
    .from(sessionRepoDbConfig.schema.sessionMetadata)
    .where(eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId))
    .get();
  if (
    metadata !== undefined &&
    (metadata.actorName !== command.actorName ||
      metadata.actorVersion !== command.actorVersion)
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-actor-mismatch',
        message: 'Command actor does not match retained session metadata',
      }),
    );
  }
  const sessionIndex = metadata?.nextSessionIndex ?? 1;
  const nextSessionIndex = sessionIndex + 1;
  if (
    !Number.isSafeInteger(sessionIndex) ||
    sessionIndex < 1 ||
    !Number.isSafeInteger(nextSessionIndex)
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'session-index-invalid',
        message: 'The durable next session index is invalid',
        extra: { sessionIndex },
      }),
    );
  }

  const encodedMutations = [];
  const inserted = new Map<
    string,
    (typeof madeMutations.mutations)[number]['model']
  >();
  const updated = new Map<
    string,
    (typeof madeMutations.mutations)[number]['model']
  >();
  const deleted = new Map<
    string,
    Readonly<{ id: string; modelName: string }>
  >();

  for (const [mutationIndex, mutation] of madeMutations.mutations.entries()) {
    const appliedMutation = yield* applyAggregateSessionMutationTx({
      tx,
      mutation,
      commandId: command.id,
      mutationIndex,
      appliedAt: startedAt,
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

  const stagedDelta = {
    inserted: insertedResources,
    updated: updatedResources,
    deleted: [...deleted.values()],
    mutations: encodedMutations,
  };
  const encodedOccurrence = {
    ...encodedCommand,
    sessionIndex,
    staging: { startedAt, completedAt: yield* dutils.date(), stagedDelta },
    admission: settleLocally
      ? { status: 'skipped' as const, reason: 'local-only' as const }
      : { status: 'pending' as const },
    execution: settleLocally
      ? { status: 'skipped' as const, reason: 'local-only' as const }
      : { status: 'pending' as const },
  };
  const commandBytes = yield* sessionRepoDbConfig.tables.commands
    .encodeRow({
      ...encodedOccurrence,
      actorDelta: null,
      aggregateIndex: null,
      executedIndex: null,
      executedHash: null,
    })
    .pipe(
      mapParseError({
        code: 'session-command-encode-failed',
        prefix: 'Failed to encode locally terminal command',
      }),
    );

  tx.insert(sessionRepoDbConfig.schema.commands)
    .values({
      ...commandBytes,
    })
    .run();
  if (!settleLocally) {
    const encodedMutationJson = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
    )(encodedMutations).pipe(
      mapParseError({
        code: 'session-optimistic-mutations-encode-failed',
        prefix: 'Failed to encode optimistic session mutations',
      }),
    );
    tx.insert(sessionRepoDbConfig.schema.optimisticAppliedMutations)
      .values({ commandId: command.id, mutations: encodedMutationJson })
      .onConflictDoUpdate({
        target: sessionRepoDbConfig.schema.optimisticAppliedMutations.commandId,
        set: { mutations: sql`excluded.mutations` },
      })
      .run();
  }
  tx.insert(sessionRepoDbConfig.schema.sessionMetadata)
    .values({
      sessionId,
      nextSessionIndex,
      actorName: command.actorName,
      actorVersion: command.actorVersion,
      aggregateIndex: state.aggregateIndex,
      executedIndex: state.executedIndex,
      executedHash: state.executedHash,
      pushIndex: state.pushIndex,
    })
    .onConflictDoUpdate({
      target: sessionRepoDbConfig.schema.sessionMetadata.sessionId,
      set: { nextSessionIndex },
    })
    .run();

  return {
    command: {
      ...command,
      sessionIndex,
      staging: encodedOccurrence.staging,
      admission: encodedOccurrence.admission,
      execution: encodedOccurrence.execution,
    },
    encodedCommand: encodedOccurrence,
  };
});
