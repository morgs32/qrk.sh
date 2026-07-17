/*
 * Frontend sync apply — session command lifecycle semantics
 *
 * `IFrontendBlock` carries a complete convergence patch plus lifecycle data:
 *
 * - `pendingPushedCommands` is the complete in-flight pushed set for this
 *   frontend. FrontendRepo already excludes terminal commands before send.
 *   Apply suppresses locally replay-failed ids and reconciles only rows at or
 *   below the block watermark. Newer local pushed rows survive and replay.
 *
 * - `executedPushedCommands` and `failedPushedCommands` are batch deltas since
 *   the last frontend index. Upsert into their session tables; remove
 *   matching ids from `pushedCommands` and `stagedCommands`. A local replay
 *   failure suppresses late execution; an authoritative failure replaces it.
 *
 * Before applying the patch, staged overlays and pushed overlays newer than
 * the prior watermark are rewound. Afterward, newer pushed commands replay in
 * pushed-cursor order, followed by staged commands in staged-cursor order.
 */
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, desc, eq, gt, lte, notInArray, sql } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { applyFrontendMutationTx } from '../contracts/applyFrontendMutationTx.ts';
import { applyMutationInverseTx } from '../contracts/applyMutationInverseTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import { decodeCommand } from '../contracts/decodeCommand.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeMutations } from '../contracts/makeMutations.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import { withSavepoint } from '../drizzle/withSavepoint.ts';
import type { IFrontendController } from '../frontendController/types.ts';
import type { IModels } from '../models/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type { IFrontendBlock, ISessionDrizzleDb } from './types.ts';

/*
 * 1. Rewind staged and locally overlaid pushed mutations.
 * 2. Apply the convergence resource patch and pending snapshot.
 * 3. Apply executed and failed terminal outcomes.
 * 4. Replay pushed commands newer than the watermark, then staged commands.
 */
export const applyFrontendBlock = Effect.fn('applyFrontendBlock')(function* <
  FRONTEND extends IFrontendController,
  MODELS extends IModels,
>(props: {
  db: ISessionDrizzleDb<MODELS, IDrizzleRelationsFromModels<MODELS>>;
  frontend: FRONTEND;
  models: MODELS;
  frontendBlock: IFrontendBlock;
  lastRebasedPushedCursor: IFrontendBlock['lastRebasedPushedCursor'];
}) {
  const { db, frontend, frontendBlock, lastRebasedPushedCursor, models } =
    props;
  const {
    delta,
    pendingPushedCommands,
    executedPushedCommands,
    failedPushedCommands,
    lastRebasedPushedCursor: nextLastRebasedPushedCursor,
  } = frontendBlock;
  const { inserted, updated, deleted } = delta;
  const resourceRows = [...inserted, ...updated];

  yield* makeTx({
    db,
    program: Effect.fn('transaction')(function* ({ tx }) {
      // 1 — rewind staged overlays, then pushed overlays newer than the prior watermark.
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
            yield* decodeAppliedMutation({
              mutation,
              model,
            }),
          );
        }

        decodedMutations.sort(
          (left, right) => right.mutationIndex - left.mutationIndex,
        );

        for (const mutation of decodedMutations) {
          yield* applyMutationInverseTx({
            tx,
            mutation,
          });
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

      // 2 — apply the server's final optimistic convergence patch.
      for (const resource of resourceRows) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: resource.modelName,
          recordKind: 'models',
        });
        upsertHelper({
          table: model.drizzleSchema,
          tx,
          values: resource,
        });
      }

      // 3 — deleted refs win after all inserted and updated rows.
      for (const removedRef of deleted) {
        const model = yield* getByKeyOrThrow({
          record: models,
          key: removedRef.modelName,
          recordKind: 'models',
        });
        tx.delete(model.drizzleSchema)
          .where(eq(model.drizzleSchema.id, removedRef.id))
          .run();
      }

      // 4 — reconcile only pushed rows represented by this block's watermark.
      const pendingPushedCommandIds: IFrontendBlock['pendingPushedCommands'][number]['id'][] =
        [];
      for (const command of pendingPushedCommands) {
        const localFailure = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .where(eq(sessionFailedCommandDrizzleSchema.id, command.id))
          .get();
        if (localFailure !== undefined) {
          continue;
        }
        upsertHelper({
          table: sessionPushedCommandDrizzleSchema,
          tx,
          values: command,
        });
        pendingPushedCommandIds.push(command.id);
      }
      if (nextLastRebasedPushedCursor !== null) {
        if (pendingPushedCommandIds.length === 0) {
          tx.delete(sessionPushedCommandDrizzleSchema)
            .where(
              lte(
                sessionPushedCommandDrizzleSchema.pushedCursor,
                nextLastRebasedPushedCursor,
              ),
            )
            .run();
        } else {
          tx.delete(sessionPushedCommandDrizzleSchema)
            .where(
              and(
                lte(
                  sessionPushedCommandDrizzleSchema.pushedCursor,
                  nextLastRebasedPushedCursor,
                ),
                notInArray(
                  sessionPushedCommandDrizzleSchema.id,
                  pendingPushedCommandIds,
                ),
              ),
            )
            .run();
        }
      }

      // 5 — a local replay failure suppresses a later authoritative execution.
      for (const command of executedPushedCommands) {
        const localFailure = tx
          .select()
          .from(sessionFailedCommandDrizzleSchema)
          .where(eq(sessionFailedCommandDrizzleSchema.id, command.id))
          .get();
        if (localFailure === undefined) {
          upsertHelper({
            table: sessionExecutedPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        tx.delete(sessionStagedCommandDrizzleSchema)
          .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
          .run();
        tx.delete(sessionPushedCommandDrizzleSchema)
          .where(eq(sessionPushedCommandDrizzleSchema.id, command.id))
          .run();
        tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .run();
      }

      // 6 — authoritative failure replaces any earlier local replay failure.
      for (const command of failedPushedCommands) {
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
        tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
          .where(
            eq(
              sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              command.id,
            ),
          )
          .run();
      }

      // 7 — rebuild pushed overlays newer than the block watermark.
      const pushedCommandsToReplay =
        nextLastRebasedPushedCursor === null
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
                  nextLastRebasedPushedCursor,
                ),
              )
              .orderBy(sessionPushedCommandDrizzleSchema.pushedCursor)
              .all();
      for (const commandRow of pushedCommandsToReplay) {
        const replayed = yield* withSavepoint({
          tx,
          program: Effect.fn('applyFrontendBlock.replayPushedCommand')(
            function* ({ tx: savepointTx }) {
              const contract = yield* getByKeyOrThrow({
                record: frontend.contracts,
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

      // 8 — staged overlays always replay after every pushed command.
      const stagedCommandsToReplay = tx
        .select()
        .from(sessionStagedCommandDrizzleSchema)
        .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
        .all();
      for (const commandRow of stagedCommandsToReplay) {
        const replayed = yield* withSavepoint({
          tx,
          program: Effect.fn('applyFrontendBlock.replayStagedCommand')(
            function* ({ tx: savepointTx }) {
              const contract = yield* getByKeyOrThrow({
                record: frontend.contracts,
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
    }),
  });
});
