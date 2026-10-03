import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyOperationTx } from '../../../contracts/applyOperationTx.ts';
import {
  encodeAppliedOperation,
  EncodedAppliedOperationSchema,
} from '../../../contracts/encodeAppliedOperation.ts';
import type { makeOperations } from '../../../contracts/make/makeOperations.ts';
import type {
  IAnyOperation,
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
  COMMAND extends ISessionCommandInput &
    Readonly<{
      pushIndex: null;
    }>,
>(
  tx: ITx,
  props: {
    settleLocally?: boolean;
    sessionId: ISessionId;
    madeOperations: Effect.Success<ReturnType<typeof makeOperations>>;
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
    madeOperations,
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
  const encodedOperations = [];
  const inserted = new Map<string, IAnyOperation['model']>();
  const updated = new Map<string, IAnyOperation['model']>();
  const deleted = new Map<
    string,
    Readonly<{
      id: string;
      modelName: string;
    }>
  >();
  for (const [
    operationIndex,
    operation,
  ] of madeOperations.operations.entries()) {
    if (operation.operationName === 'async') {
      return yield* makeZerospinError('browser-async-operation-forbidden');
    }
    const appliedOperation = yield* applyOperationTx({
      tx,
      operation,
      commandId: command.id,
      operationIndex,
      appliedAt: startedAt,
    });
    const encodedOperation = yield* encodeAppliedOperation({
      operation: appliedOperation,
    });
    encodedOperations.push(encodedOperation);
    const key = `${operation.model.modelName}\u0000${operation.resourceId}`;
    if (operation.operationName === 'delete') {
      if (inserted.delete(key)) {
        updated.delete(key);
        deleted.delete(key);
      } else {
        updated.delete(key);
        deleted.set(key, {
          id: operation.resourceId,
          modelName: operation.model.modelName,
        });
      }
    } else if (operation.operationName === 'create') {
      inserted.set(key, operation.model);
      updated.delete(key);
      deleted.delete(key);
    } else if (!inserted.has(key)) {
      updated.set(key, operation.model);
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
    if (row === undefined) {
      continue;
    }
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
    if (row === undefined) {
      continue;
    }
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
    operations: encodedOperations,
  };
  const encodedOccurrence = {
    ...encodedCommand,
    sessionIndex,
    staging: {
      result: madeOperations.encodedResult,
      startedAt,
      completedAt: yield* dutils.date(),
      stagedDelta,
    },
    failure: null,
  };
  const commandBytes = yield* sessionRepoDbConfig.tables.commands
    .encodeRow({
      ...encodedOccurrence,
      failure: null,
      actorDelta: null,
      aggregateIndex: null,
      executedIndex: settleLocally ? state.executedIndex : null,
      executedHash: settleLocally ? state.executedHash : null,
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
    const encodedOperationJson = yield* Schema.encodeEffect(
      Schema.fromJsonString(Schema.Array(EncodedAppliedOperationSchema)),
    )(encodedOperations).pipe(
      mapParseError({
        code: 'session-optimistic-operations-encode-failed',
        prefix: 'Failed to encode optimistic session operations',
      }),
    );
    tx.insert(sessionRepoDbConfig.schema.optimisticAppliedOperations)
      .values({ commandId: command.id, operations: encodedOperationJson })
      .onConflictDoUpdate({
        target:
          sessionRepoDbConfig.schema.optimisticAppliedOperations.commandId,
        set: { operations: sql`excluded.operations` },
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
      failure: encodedOccurrence.failure,
    },
    encodedCommand: encodedOccurrence,
  };
});
