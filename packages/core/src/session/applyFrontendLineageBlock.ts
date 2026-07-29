/*
 * Direct account server-lineage application.
 *
 * 1. Validate the complete archived target and exact next frontend index.
 * 2. Commit generation boundaries without pretending they are resource deltas.
 * 3. Rewind local optimistic overlays before authoritative resource changes.
 * 4. Persist complete pending/terminal command truth from the server block.
 * 5. Replay stored encoded optimistic mutations without rerunning contracts.
 * 6. Preserve command systemVersion provenance across compatible versions of
 *    the same generation archive.
 */
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, desc, eq, gt, lte, notInArray } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { applyFrontendMutationTx } from '../contracts/applyFrontendMutationTx.ts';
import { applyMutationInverseTx } from '../contracts/applyMutationInverseTx.ts';
import { decodeAppliedMutation } from '../contracts/decodeAppliedMutation.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDrizzleRelationsFromModels } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';
import type {
  IFrontendController,
  InferFrontendModels,
} from '../frontendController/types.ts';
import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { FrontendLineageBlockSchema } from './FrontendBlockSchema.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type { IFrontendLineageBlock, ISessionDrizzleDb } from './types.ts';

export const applyFrontendLineageBlock = Effect.fn('applyFrontendLineageBlock')(
  function* <FRONTEND extends IFrontendController>(props: {
    db: ISessionDrizzleDb<
      InferFrontendModels<FRONTEND>,
      IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
    >;
    frontend: FRONTEND;
    models: InferFrontendModels<FRONTEND>;
    lineageBlock: IFrontendLineageBlock;
    accountId: IFrontendLineageBlock['accountId'];
    actorId: IFrontendLineageBlock['actorId'];
    systemId: IFrontendLineageBlock['systemId'];
    generationId: string;
    systemVersion: string;
    currentFrontendIndex: number;
  }): Effect.fn.Return<void, IAnyError> {
    const {
      accountId,
      actorId,
      currentFrontendIndex,
      db,
      frontend,
      generationId,
      lineageBlock,
      models,
      systemId,
      systemVersion,
    } = props;

    yield* Schema.encode(FrontendLineageBlockSchema)(lineageBlock, {
      onExcessProperty: 'error',
    }).pipe(
      mapParseError({
        code: 'frontend-lineage-block-encode-failed',
        prefix: 'Failed to encode frontend lineage block',
      }),
    );

    const lineageFrontendIndex =
      lineageBlock.kind === 'generation-boundary'
        ? lineageBlock.frontendIndex
        : lineageBlock.frontendBlock.frontendIndex;
    if (
      lineageBlock.systemId !== systemId ||
      lineageBlock.accountId !== accountId ||
      lineageBlock.accountName !== frontend.accountName ||
      lineageBlock.actorId !== actorId ||
      lineageBlock.actorName !== frontend.actorName ||
      lineageBlock.frontendName !== frontend.frontendName ||
      lineageFrontendIndex !== currentFrontendIndex + 1
    ) {
      return yield* new ZerospinError({
        code: 'frontend-lineage-block-target-mismatch',
        message:
          'Frontend lineage block does not match the bound account target',
        extra: {
          expectedSystemId: systemId,
          expectedGenerationId: generationId,
          expectedAccountId: accountId,
          expectedAccountName: frontend.accountName,
          expectedActorId: actorId,
          expectedActorName: frontend.actorName,
          expectedFrontendName: frontend.frontendName,
          expectedFrontendIndex: currentFrontendIndex + 1,
          actualSystemId: lineageBlock.systemId,
          actualGenerationId: lineageBlock.generationId,
          actualAccountId: lineageBlock.accountId,
          actualAccountName: lineageBlock.accountName,
          actualActorId: lineageBlock.actorId,
          actualActorName: lineageBlock.actorName,
          actualFrontendName: lineageBlock.frontendName,
          actualFrontendIndex: lineageFrontendIndex,
          systemVersion,
        },
      });
    }

    if (lineageBlock.kind === 'generation-boundary') {
      if (
        lineageBlock.prevGenerationId !== generationId ||
        lineageBlock.generationId === generationId
      ) {
        return yield* new ZerospinError({
          code: 'frontend-generation-boundary-lineage-mismatch',
          message:
            'Frontend generation boundary does not continue this replica',
        });
      }

      yield* makeTx({
        db,
        program: Effect.fn('applyFrontendLineageBlock.generationBoundary')(
          function* () {
            yield* Effect.void;
          },
        ),
      });
      return;
    }

    if (
      lineageBlock.generationId !== generationId ||
      lineageBlock.frontendBlock.frontendName !== frontend.frontendName ||
      lineageBlock.frontendBlock.frontendIndex !== lineageFrontendIndex
    ) {
      return yield* new ZerospinError({
        code: 'frontend-resource-lineage-block-mismatch',
        message: 'Frontend resource lineage block does not match this replica',
      });
    }

    const frontendBlock = lineageBlock.frontendBlock;
    const resourceRows = [
      ...frontendBlock.delta.inserted,
      ...frontendBlock.delta.updated,
    ];
    for (const resource of resourceRows) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: resource.modelName,
        recordKind: 'frontend models',
      });
      yield* Schema.decodeUnknown(makeEffectSchema(model.propertiesShape))(
        resource,
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'frontend-lineage-block-resource-invalid',
          prefix: `Failed to decode frontend lineage resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }
    for (const removedRef of frontendBlock.delta.deleted) {
      const model = yield* getByKeyOrThrow({
        record: models,
        key: removedRef.modelName,
        recordKind: 'frontend models',
      });
      yield* Schema.validate(
        Schema.Struct({
          id: makeAbbreviationIdSchema(model.abbreviation),
          modelName: Schema.Literal(model.modelName),
        }),
      )(removedRef, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'frontend-lineage-block-ref-invalid',
          prefix: `Failed to decode deleted frontend ref ${removedRef.modelName}.${removedRef.id}`,
        }),
      );
    }
    for (const command of frontendBlock.pendingPushedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-lineage-block-pending-command-target-mismatch',
          message: `Pending command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }
    for (const command of frontendBlock.executedPushedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-lineage-block-executed-command-target-mismatch',
          message: `Executed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }
    for (const command of frontendBlock.failedPushedCommands) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-lineage-block-failed-command-target-mismatch',
          message: `Failed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }

    yield* makeTx({
      db,
      program: Effect.fn('applyFrontendLineageBlock.server')(function* ({
        tx,
      }) {
        // 1 — rewind all local overlays in reverse application order.
        const stagedCommandsToRewind = tx
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .orderBy(desc(sessionStagedCommandDrizzleSchema.stagedCursor))
          .all();
        const pushedCommandsToRewind =
          frontendBlock.lastRebasedPushedCursor === null
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
                    frontendBlock.lastRebasedPushedCursor,
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
          const encodedMutations = yield* Schema.decode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(optimisticRow.mutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-decode-failed',
              prefix: 'Failed to decode optimistic session mutations',
            }),
          );
          const decodedMutations = [];
          for (const encodedMutation of encodedMutations) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: encodedMutation.modelName,
              recordKind: 'frontend models',
            });
            decodedMutations.push(
              yield* decodeAppliedMutation({
                mutation: encodedMutation,
                model,
              }),
            );
          }
          decodedMutations.sort(
            (left, right) => right.mutationIndex - left.mutationIndex,
          );
          for (const decodedMutation of decodedMutations) {
            yield* applyMutationInverseTx({ tx, mutation: decodedMutation });
          }
        }

        // 2 — apply the authoritative resource delta.
        for (const resource of resourceRows) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: resource.modelName,
            recordKind: 'frontend models',
          });
          upsertHelper({ table: model.drizzleSchema, tx, values: resource });
        }
        for (const removedRef of frontendBlock.delta.deleted) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: removedRef.modelName,
            recordKind: 'frontend models',
          });
          tx.delete(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, removedRef.id))
            .run();
        }

        // 3 — reconcile the complete pending set through this block's watermark.
        const pendingPushedCommandIds: (typeof frontendBlock.pendingPushedCommands)[number]['id'][] =
          [];
        for (const command of frontendBlock.pendingPushedCommands) {
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
        if (frontendBlock.lastRebasedPushedCursor !== null) {
          if (pendingPushedCommandIds.length === 0) {
            tx.delete(sessionPushedCommandDrizzleSchema)
              .where(
                lte(
                  sessionPushedCommandDrizzleSchema.pushedCursor,
                  frontendBlock.lastRebasedPushedCursor,
                ),
              )
              .run();
          } else {
            tx.delete(sessionPushedCommandDrizzleSchema)
              .where(
                and(
                  lte(
                    sessionPushedCommandDrizzleSchema.pushedCursor,
                    frontendBlock.lastRebasedPushedCursor,
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

        // 4 — persist full terminal authority and remove local intent rows.
        for (const command of frontendBlock.executedPushedCommands) {
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
        for (const command of frontendBlock.failedPushedCommands) {
          tx.delete(sessionStagedCommandDrizzleSchema)
            .where(eq(sessionStagedCommandDrizzleSchema.id, command.id))
            .run();
          tx.delete(sessionPushedCommandDrizzleSchema)
            .where(eq(sessionPushedCommandDrizzleSchema.id, command.id))
            .run();
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: command,
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

        // 5 — replay stored encoded operations and recompute their inverses.
        const pushedCommandsToReplay =
          frontendBlock.lastRebasedPushedCursor === null
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
                    frontendBlock.lastRebasedPushedCursor,
                  ),
                )
                .orderBy(sessionPushedCommandDrizzleSchema.pushedCursor)
                .all();
        const stagedCommandsToReplay = tx
          .select()
          .from(sessionStagedCommandDrizzleSchema)
          .orderBy(sessionStagedCommandDrizzleSchema.stagedCursor)
          .all();
        for (const command of [
          ...pushedCommandsToReplay,
          ...stagedCommandsToReplay,
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
          const encodedMutations = yield* Schema.decode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(optimisticRow.mutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-decode-failed',
              prefix: 'Failed to decode optimistic session mutations',
            }),
          );
          const nextEncodedMutations = [];
          for (const encodedMutation of encodedMutations) {
            const model = yield* getByKeyOrThrow({
              record: models,
              key: encodedMutation.modelName,
              recordKind: 'frontend models',
            });
            const decodedMutation = yield* decodeAppliedMutation({
              mutation: encodedMutation,
              model,
            });
            const nextAppliedMutation = yield* applyFrontendMutationTx({
              tx,
              mutation: decodedMutation,
              commandId: encodedMutation.commandId,
              mutationIndex: encodedMutation.mutationIndex,
              appliedAt: encodedMutation.appliedAt,
            });
            nextEncodedMutations.push(
              yield* encodeAppliedMutation({ mutation: nextAppliedMutation }),
            );
          }
          const encodedNextMutations = yield* Schema.encode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(nextEncodedMutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-encode-failed',
              prefix: 'Failed to encode optimistic session mutations',
            }),
          );
          tx.update(sessionOptimisticAppliedMutationDrizzleSchema)
            .set({ mutations: encodedNextMutations })
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                command.id,
              ),
            )
            .run();
        }
      }),
    });
  },
);
