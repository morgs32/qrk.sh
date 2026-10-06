import { makeZerospinError, mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyOperationTx } from '../../../contracts/applyOperationTx.ts';
import { encodeAppliedOperation } from '../../../contracts/encodeAppliedOperation.ts';
import { encodeCommand } from '../../../contracts/encodeCommand.ts';
import type {
  IAnyOperation,
  IContract,
  IContractOutput,
  ISessionCommandInput,
} from '../../../contracts/types.ts';
import type { ITx } from '../../../drizzle/types.ts';
import { EncodedResourceSchema } from '../../../models/EncodedResourceSchema.ts';
import type { IAnyModels } from '../../../models/types.ts';
import { dutils } from '../../../utils/dutils.ts';
import { sessionRepoDbConfig } from '../../sessionRepoDbConfig.ts';
import type { IInitializedSessionState, ISessionId } from '../../types.ts';

export type IApplySessionCommandTxProps<
  COMMAND extends ISessionCommandInput,
  RESULT,
> = Readonly<{
  sessionId: ISessionId;
  contract: IContract;
  command: COMMAND & Readonly<{ pushIndex: null }>;
  madeOperations: Readonly<{
    operations: readonly IContractOutput[];
    result: RESULT;
    encodedResult: typeof Schema.Json.Type;
  }>;
  startedAt: Date;
  state: Pick<
    IInitializedSessionState<IAnyModels>,
    'aggregateIndex' | 'executedIndex' | 'executedHash' | 'pushIndex'
  >;
}>;

/** Apply a local occurrence inside its caller's transaction. */
export const applySessionCommandTx = Effect.fn('applySessionCommandTx')(
  function* <COMMAND extends ISessionCommandInput, RESULT>(
    tx: ITx,
    props: IApplySessionCommandTxProps<COMMAND, RESULT>,
  ) {
    const { sessionId, contract, madeOperations, startedAt, state, command } =
      props;
    const metadata = tx
      .select()
      .from(sessionRepoDbConfig.schema.sessionMetadata)
      .where(
        eq(sessionRepoDbConfig.schema.sessionMetadata.sessionId, sessionId),
      )
      .get();
    const sessionIndex = metadata?.nextSessionIndex ?? 1;
    if (
      !Number.isSafeInteger(sessionIndex) ||
      sessionIndex < 1 ||
      sessionIndex >= Number.MAX_SAFE_INTEGER
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'session-index-invalid',
          message: 'The durable next session index is invalid',
          extra: { sessionIndex: String(sessionIndex) },
        }),
      );
    }
    const nextSessionIndex = sessionIndex + 1;
    const encodedCommand = yield* encodeCommand({ contract, command });
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
    const stagedDelta = {
      inserted: yield* readAppliedResourcesTx(tx, inserted),
      updated: yield* readAppliedResourcesTx(tx, updated),
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
    };
    tx.insert(sessionRepoDbConfig.schema.sessionMetadata)
      .values({
        sessionId,
        nextSessionIndex,
        changeIndex: metadata?.changeIndex ?? 0,
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
        staging: {
          ...encodedOccurrence.staging,
          result: madeOperations.result,
        },
      },
      encodedCommand: encodedOccurrence,
      commandRow: {
        ...encodedOccurrence,
        nodeId: null,
        nodeIndex: null,
        admissionIndex: null,
        admission: null,
        execution: null,
        actorDelta: null,
        aggregateIndex: null,
      },
    };
  },
);

const readAppliedResourcesTx = Effect.fn('readAppliedResourcesTx')(function* (
  tx: ITx,
  modelsByResourceKey: ReadonlyMap<string, IAnyOperation['model']>,
) {
  const resources = [];
  for (const [key, model] of modelsByResourceKey) {
    const id = key.slice(key.indexOf('\u0000') + 1);
    const row = tx
      .select()
      .from(model.drizzleSchema)
      .where(eq(model.drizzleSchema.id, id))
      .get();
    if (row === undefined) {
      continue;
    }
    resources.push(
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
  return resources;
});
