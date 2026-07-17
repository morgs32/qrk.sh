import type { Async } from '@zerospin/core/async/Async';
import { applyFrontendMutationTx } from '@zerospin/core/contracts/applyFrontendMutationTx';
import { applyMutationInverseTx } from '@zerospin/core/contracts/applyMutationInverseTx';
import { decodeAppliedMutation } from '@zerospin/core/contracts/decodeAppliedMutation';
import { decodeCommand } from '@zerospin/core/contracts/decodeCommand';
import type {
  IEncodedCommand,
  IFailedStagedCommand,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { getInitializedStateOrThrow } from '@zerospin/core/session/getInitializedStateOrThrow';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from '@zerospin/core/session/sessionCommandShape';
import type { ISession } from '@zerospin/core/session/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { newSyncRpcSession } from '@zerospin/core/utils/newSyncRpcSession';
import type { ZerospinApis } from '@zerospin/dispatch-worker/ZerospinApis';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  makeTraceableApiTarget,
  type TelemetryCollector,
} from '@zerospin/logger';
import { desc, eq, gt, sql } from 'drizzle-orm';
import { Effect, Either, Redacted, Schema } from 'effect';

export const pushStagedCommands = Effect.fn('pushStagedCommands')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  session: ISession<FRONTEND>;
}): Effect.fn.Return<
  Readonly<{
    pendingCommands: readonly IEncodedCommand<IPushedCommand>[];
    pushedCommands: readonly IEncodedCommand<IPushedCommand>[];
    failedCommands: readonly IEncodedCommand<IFailedStagedCommand>[];
  }>,
  IAnyError,
  | Async
  | CuidFactory
  | PublishableKey
  | TelemetryCollector
  | ZerospinApisUrl
> {
  const { session } = props;

  const { db, models } = getInitializedStateOrThrow({ session });

  const stagedRows = db
    .select()
    .from(sessionStagedCommandDrizzleSchema)
    .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
    .all();

  if (stagedRows.length === 0) {
    return {
      pendingCommands: [],
      pushedCommands: [],
      failedCommands: [],
    };
  }

  const publishableKey = yield* PublishableKey;
  const apiUrl = yield* ZerospinApisUrl;
  const signature = yield* session.generateSignature();

  using apis = newSyncRpcSession<ZerospinApis>(apiUrl);
  const frontendApi = makeTraceableApiTarget(
    apis.getFrontendApi({
      publishableKey: Redacted.value(publishableKey),
      accountName: session.frontend.accountName,
      actorName: session.frontend.actorName,
      frontendName: session.frontend.frontendName,
      signature,
    }),
  );

  const { pendingCommands, pushedCommands, failedCommands } =
    yield* frontendApi
      .pushCommands({
        commands: stagedRows,
      })
      .pipe(
        Effect.mapError(error =>
          error instanceof Error
            ? ZerospinError.catch({ code: 'async-failed' })(error)
            : new ZerospinError(error),
        ),
      );
  const { lastRebasedPushedCursor } = getInitializedStateOrThrow({ session });

  yield* makeTx({
    db,
    program: Effect.fn('pushStagedCommands.transaction')(function* ({ tx }) {
      // 1 — remove every local overlay in reverse application order.
      const stagedCommandsToRewind = tx
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .orderBy(desc(sessionStagedCommandDrizzleSchema.stagedCursor))
        .all();
      const pushedCommandsToRewind =
        lastRebasedPushedCursor === null
          ? tx
              .select()
              .from(sessionPushedCommandDrizzleSchema)
              .orderBy(desc(sessionPushedCommandDrizzleSchema.pushedCursor))
              .all()
          : tx
              .select()
              .from(sessionPushedCommandDrizzleSchema)
              .where(
                gt(
                  sessionPushedCommandDrizzleSchema.pushedCursor,
                  lastRebasedPushedCursor,
                ),
              )
              .orderBy(desc(sessionPushedCommandDrizzleSchema.pushedCursor))
              .all();

      for (const command of [
        ...stagedCommandsToRewind,
        ...pushedCommandsToRewind,
      ]) {
        const optimisticRow = tx
          .select()
          .from(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .get();
        if (optimisticRow === undefined) {
          continue;
        }

        const optimisticMutations = yield* Schema.decode(
          Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
        )(optimisticRow.mutations).pipe(
          mapParseError({
            code: 'session-optimistic-mutations-decode-failed',
            prefix: 'Failed to decode optimistic session mutations',
          }),
        );
        const decodedMutations = [];
        for (const mutation of optimisticMutations) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: mutation.modelName,
            recordKind: 'models',
          });
          decodedMutations.push(
            yield* decodeAppliedMutation({ mutation, model }),
          );
        }
        decodedMutations.sort(
          (left, right) => right.mutationIndex - left.mutationIndex,
        );
        for (const mutation of decodedMutations) {
          yield* applyMutationInverseTx({ tx, mutation });
        }
        tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .run();
      }

      // 2 — move recovered pending and newly accepted rows into pushedCommands.
      for (const command of pendingCommands) {
        const executed = tx
          .select()
          .from(sessionExecutedPushedCommandDrizzleSchema)
          .where(eq(sessionExecutedPushedCommandDrizzleSchema.id, command.id))
          .get();
        const failed = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .where(eq(sessionFailedCommandDrizzleSchema.id, command.id))
          .get();
        if (executed !== undefined || failed !== undefined) {
          continue;
        }
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
        upsertHelper({
          table: sessionPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
      }
      for (const command of pushedCommands) {
        const executed = tx
          .select()
          .from(sessionExecutedPushedCommandDrizzleSchema)
          .where(eq(sessionExecutedPushedCommandDrizzleSchema.id, command.id))
          .get();
        const failed = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .where(eq(sessionFailedCommandDrizzleSchema.id, command.id))
          .get();
        if (executed !== undefined || failed !== undefined) {
          continue;
        }
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
        upsertHelper({
          table: sessionPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
      }

      // 3 — rejected staged rows become terminal local failures.
      for (const command of failedCommands) {
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
        tx.delete(sessionPushedCommandDrizzleSchema)
          .where(eq(sessionPushedCommandDrizzleSchema.id, command.id))
          .run();
        upsertHelper({
          table: sessionFailedCommandDrizzleSchema,
          tx,
          values: {
            id: command.id,
            commandName: command.commandName,
            payload: command.payload,
            version: command.version,
            status: 'failed',
            failedAt: command.failedAt,
            failure: command.failure,
          },
        });
      }

      // 4 — rebuild pushed overlays newer than the server watermark.
      const pushedCommandsToReplay =
        lastRebasedPushedCursor === null
          ? tx
              .select()
              .from(sessionPushedCommandDrizzleSchema)
              .orderBy(sessionPushedCommandDrizzleSchema.pushedCursor)
              .all()
          : tx
              .select()
              .from(sessionPushedCommandDrizzleSchema)
              .where(
                gt(
                  sessionPushedCommandDrizzleSchema.pushedCursor,
                  lastRebasedPushedCursor,
                ),
              )
              .orderBy(sessionPushedCommandDrizzleSchema.pushedCursor)
              .all();
      for (const commandRow of pushedCommandsToReplay) {
        const replayed = yield* withSavepoint({
          tx,
          program: Effect.fn('pushStagedCommands.replayPushedCommand')(
            function* ({ tx: savepointTx }) {
              const contract = yield* getByKeyOrThrow({
                record: session.frontend.contracts,
                key: commandRow.commandName,
                recordKind: 'contracts',
              });
              const command = yield* decodeCommand({
                contract,
                command: commandRow,
              });
              const { mutations } = yield* makeMutations({
                contract,
                models,
                owner: { kind: 'account' },
                command,
              });
              const encodedAppliedMutations = [];
              for (const [mutationIndex, mutation] of mutations.entries()) {
                const appliedMutation = yield* applyFrontendMutationTx({
                  tx: savepointTx,
                  mutation,
                  commandId: command.id,
                  mutationIndex,
                  appliedAt: commandRow.stagedAt,
                });
                encodedAppliedMutations.push(
                  yield* encodeAppliedMutation({ mutation: appliedMutation }),
                );
              }
              const optimisticMutations = yield* Schema.encode(
                Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
              )(encodedAppliedMutations).pipe(
                mapParseError({
                  code: 'session-optimistic-mutations-encode-failed',
                  prefix: 'Failed to encode optimistic session mutations',
                }),
              );
              savepointTx
                .insert(sessionOptimisticAppliedMutationDrizzleSchema)
                .values({
                  commandId: command.id,
                  mutations: optimisticMutations,
                })
                .onConflictDoUpdate({
                  target:
                    sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                  set: {
                    mutations: sql`excluded.mutations`,
                  },
                })
                .run();
            },
            annotateFunctionSpan,
          ),
        }).pipe(Effect.either);
        if (Either.isLeft(replayed)) {
          tx.delete(sessionPushedCommandDrizzleSchema)
            .where(eq(sessionPushedCommandDrizzleSchema.id, commandRow.id))
            .run();
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: {
              id: commandRow.id,
              commandName: commandRow.commandName,
              payload: commandRow.payload,
              version: commandRow.version,
              status: 'failed',
              failedAt: new Date(),
              failure: ZerospinError.stringify(replayed.left),
            },
          });
        }
      }

      // 5 — commands staged while the RPC was in flight replay last.
      const stagedCommandsToReplay = tx
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
        .all();
      for (const commandRow of stagedCommandsToReplay) {
        const replayed = yield* withSavepoint({
          tx,
          program: Effect.fn('pushStagedCommands.replayStagedCommand')(
            function* ({ tx: savepointTx }) {
              const contract = yield* getByKeyOrThrow({
                record: session.frontend.contracts,
                key: commandRow.commandName,
                recordKind: 'contracts',
              });
              const command = yield* decodeCommand({
                contract,
                command: commandRow,
              });
              const { mutations } = yield* makeMutations({
                contract,
                models,
                owner: { kind: 'account' },
                command,
              });
              const encodedAppliedMutations = [];
              for (const [mutationIndex, mutation] of mutations.entries()) {
                const appliedMutation = yield* applyFrontendMutationTx({
                  tx: savepointTx,
                  mutation,
                  commandId: command.id,
                  mutationIndex,
                  appliedAt: commandRow.stagedAt,
                });
                encodedAppliedMutations.push(
                  yield* encodeAppliedMutation({ mutation: appliedMutation }),
                );
              }
              const optimisticMutations = yield* Schema.encode(
                Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
              )(encodedAppliedMutations).pipe(
                mapParseError({
                  code: 'session-optimistic-mutations-encode-failed',
                  prefix: 'Failed to encode optimistic session mutations',
                }),
              );
              savepointTx
                .insert(sessionOptimisticAppliedMutationDrizzleSchema)
                .values({
                  commandId: command.id,
                  mutations: optimisticMutations,
                })
                .onConflictDoUpdate({
                  target:
                    sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                  set: {
                    mutations: sql`excluded.mutations`,
                  },
                })
                .run();
            },
            annotateFunctionSpan,
          ),
        }).pipe(Effect.either);
        if (Either.isLeft(replayed)) {
          tx.delete(sessionStagedCommandDrizzleSchema)
            .where(eq(sessionStagedCommandDrizzleSchema.id, commandRow.id))
            .run();
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: {
              id: commandRow.id,
              commandName: commandRow.commandName,
              payload: commandRow.payload,
              version: commandRow.version,
              status: 'failed',
              failedAt: new Date(),
              failure: ZerospinError.stringify(replayed.left),
            },
          });
        }
      }
    }, annotateFunctionSpan),
  });

  return {
    pendingCommands,
    pushedCommands,
    failedCommands,
  };
}, annotateFunctionSpan);
