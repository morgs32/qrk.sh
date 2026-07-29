/*
 * Account replica block application.
 *
 * 1. Validate the complete target, local/server index rules, and strict wire
 *    encoding before opening a transaction.
 * 2. Accept an equal replica index only when the caller supplies the exact
 *    previous block and both canonical schema encodings are identical.
 * 3. A generation boundary commits no resource or command-table mutation.
 * 4. Ordinary server blocks rewind and replay stored encoded optimistic
 *    mutations without rerunning authored contract programs.
 * 5. Local command blocks apply their already-computed resource and lifecycle
 *    changes directly in the same SQLite transaction.
 * 6. Preserve every command's historical systemVersion; archive and replica
 *    ownership is generation/frontend-scoped rather than version-scoped.
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

import { FrontendReplicaBlockSchema } from './FrontendBlockSchema.ts';
import {
  sessionExecutedPushedCommandDrizzleSchema,
  sessionFailedCommandDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
  sessionPushedCommandDrizzleSchema,
  sessionStagedCommandDrizzleSchema,
} from './sessionCommandShape.ts';
import type { IFrontendReplicaBlock, ISessionDrizzleDb } from './types.ts';

export const applyFrontendBlock = Effect.fn('applyFrontendBlock')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  db: ISessionDrizzleDb<
    InferFrontendModels<FRONTEND>,
    IDrizzleRelationsFromModels<InferFrontendModels<FRONTEND>>
  >;
  frontend: FRONTEND;
  models: InferFrontendModels<FRONTEND>;
  frontendReplicaBlock: IFrontendReplicaBlock;
  accountId: IFrontendReplicaBlock['accountId'];
  actorId: IFrontendReplicaBlock['actorId'];
  systemId: IFrontendReplicaBlock['systemId'];
  generationId: string;
  systemVersion: string;
  systemWorkerName: string;
  currentFrontendIndex: number;
  currentReplicaIndex: number;
  previousReplicaBlock: IFrontendReplicaBlock | null;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  const {
    accountId,
    actorId,
    currentFrontendIndex,
    currentReplicaIndex,
    db,
    frontend,
    frontendReplicaBlock,
    generationId,
    models,
    previousReplicaBlock,
    systemId,
    systemVersion,
  } = props;

  if (
    frontendReplicaBlock.systemId !== systemId ||
    frontendReplicaBlock.generationId !== generationId ||
    frontendReplicaBlock.accountId !== accountId ||
    frontendReplicaBlock.accountName !== frontend.accountName ||
    frontendReplicaBlock.actorId !== actorId ||
    frontendReplicaBlock.actorName !== frontend.actorName ||
    frontendReplicaBlock.frontendName !== frontend.frontendName ||
    frontendReplicaBlock.frontendVersion !== frontend.version
  ) {
    return yield* new ZerospinError({
      code: 'frontend-replica-block-target-mismatch',
      message: 'Frontend replica block does not match the bound account target',
      extra: {
        expectedSystemId: systemId,
        expectedGenerationId: generationId,
        expectedAccountId: accountId,
        expectedAccountName: frontend.accountName,
        expectedActorId: actorId,
        expectedActorName: frontend.actorName,
        expectedFrontendName: frontend.frontendName,
        expectedFrontendVersion: frontend.version,
        actualSystemId: frontendReplicaBlock.systemId,
        actualGenerationId: frontendReplicaBlock.generationId,
        actualAccountId: frontendReplicaBlock.accountId,
        actualAccountName: frontendReplicaBlock.accountName,
        actualActorId: frontendReplicaBlock.actorId,
        actualActorName: frontendReplicaBlock.actorName,
        actualFrontendName: frontendReplicaBlock.frontendName,
        actualFrontendVersion: frontendReplicaBlock.frontendVersion,
        systemVersion,
      },
    });
  }

  const encodedReplicaBlock = yield* Schema.encode(FrontendReplicaBlockSchema)(
    frontendReplicaBlock,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'frontend-replica-block-encode-failed',
      prefix: 'Failed to encode frontend replica block',
    }),
  );

  if (frontendReplicaBlock.replicaIndex === currentReplicaIndex) {
    if (previousReplicaBlock === null) {
      return yield* new ZerospinError({
        code: 'frontend-replica-block-duplicate-proof-missing',
        message:
          'Equal-index frontend replica block requires the previous block',
      });
    }
    const encodedPreviousReplicaBlock = yield* Schema.encode(
      FrontendReplicaBlockSchema,
    )(previousReplicaBlock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'frontend-previous-replica-block-encode-failed',
        prefix: 'Failed to encode previous frontend replica block',
      }),
    );
    if (
      JSON.stringify(encodedReplicaBlock) ===
      JSON.stringify(encodedPreviousReplicaBlock)
    ) {
      return 'duplicate';
    }
    return yield* new ZerospinError({
      code: 'frontend-replica-block-conflicting-duplicate',
      message: 'Equal-index frontend replica blocks have different bytes',
      extra: { replicaIndex: frontendReplicaBlock.replicaIndex },
    });
  }

  if (frontendReplicaBlock.replicaIndex !== currentReplicaIndex + 1) {
    return yield* new ZerospinError({
      code: 'frontend-replica-block-index-gap',
      message: 'Frontend replica block is not the exact next replica index',
      extra: {
        currentReplicaIndex,
        receivedReplicaIndex: frontendReplicaBlock.replicaIndex,
      },
    });
  }

  if (frontendReplicaBlock.kind === 'local-command') {
    if (frontendReplicaBlock.frontendIndex !== currentFrontendIndex) {
      return yield* new ZerospinError({
        code: 'frontend-local-command-block-index-mismatch',
        message: 'Local command block must preserve the server frontend index',
        extra: {
          currentFrontendIndex,
          receivedFrontendIndex: frontendReplicaBlock.frontendIndex,
        },
      });
    }

    for (const resource of [
      ...frontendReplicaBlock.delta.inserted,
      ...frontendReplicaBlock.delta.updated,
    ]) {
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
          code: 'frontend-replica-block-resource-invalid',
          prefix: `Failed to decode frontend replica resource ${resource.modelName}.${resource.id}`,
        }),
      );
    }
    for (const removedRef of frontendReplicaBlock.delta.deleted) {
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
          code: 'frontend-replica-block-ref-invalid',
          prefix: `Failed to decode deleted frontend replica ref ${removedRef.modelName}.${removedRef.id}`,
        }),
      );
    }
    for (const optimisticRow of frontendReplicaBlock.optimisticAppliedMutationsAdded) {
      for (const mutation of optimisticRow.mutations) {
        if (mutation.commandId !== optimisticRow.commandId) {
          return yield* new ZerospinError({
            code: 'frontend-replica-block-mutation-command-mismatch',
            message: `Optimistic mutation command "${mutation.commandId}" does not match row "${optimisticRow.commandId}"`,
          });
        }
        yield* getByKeyOrThrow({
          record: models,
          key: mutation.modelName,
          recordKind: 'frontend models',
        });
      }
    }
    for (const command of frontendReplicaBlock.stagedCommandsAdded) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-block-staged-command-target-mismatch',
          message: `Staged command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }
    for (const command of frontendReplicaBlock.pushedCommandsAdded) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-block-pushed-command-target-mismatch',
          message: `Pushed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }
    for (const command of frontendReplicaBlock.executedPushedCommandsAdded) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-block-executed-command-target-mismatch',
          message: `Executed command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }
    for (const command of frontendReplicaBlock.failedStagedCommandsAdded) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-block-failed-staged-command-target-mismatch',
          message: `Failed staged command "${command.id}" does not match the bound account target`,
        });
      }
      yield* getByKeyOrThrow({
        record: frontend.contracts,
        key: command.commandName,
        recordKind: 'frontend contracts',
      });
    }
    for (const command of frontendReplicaBlock.failedPushedCommandsAdded) {
      if (
        command.accountId !== accountId ||
        command.actorId !== actorId ||
        command.accountName !== frontend.accountName ||
        command.actorName !== frontend.actorName ||
        command.frontendName !== frontend.frontendName ||
        command.systemName !== frontend.systemName
      ) {
        return yield* new ZerospinError({
          code: 'frontend-replica-block-failed-pushed-command-target-mismatch',
          message: `Failed pushed command "${command.id}" does not match the bound account target`,
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
      program: Effect.fn('applyFrontendBlock.localCommand')(function* ({ tx }) {
        for (const resource of [
          ...frontendReplicaBlock.delta.inserted,
          ...frontendReplicaBlock.delta.updated,
        ]) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: resource.modelName,
            recordKind: 'frontend models',
          });
          upsertHelper({ table: model.drizzleSchema, tx, values: resource });
        }
        for (const removedRef of frontendReplicaBlock.delta.deleted) {
          const model = yield* getByKeyOrThrow({
            record: models,
            key: removedRef.modelName,
            recordKind: 'frontend models',
          });
          tx.delete(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, removedRef.id))
            .run();
        }

        for (const commandId of frontendReplicaBlock.stagedCommandIdsRemoved) {
          tx.delete(sessionStagedCommandDrizzleSchema)
            .where(eq(sessionStagedCommandDrizzleSchema.id, commandId))
            .run();
        }
        for (const commandId of frontendReplicaBlock.pushedCommandIdsRemoved) {
          tx.delete(sessionPushedCommandDrizzleSchema)
            .where(eq(sessionPushedCommandDrizzleSchema.id, commandId))
            .run();
        }
        for (const commandId of frontendReplicaBlock.executedPushedCommandIdsRemoved) {
          tx.delete(sessionExecutedPushedCommandDrizzleSchema)
            .where(eq(sessionExecutedPushedCommandDrizzleSchema.id, commandId))
            .run();
        }
        for (const commandId of frontendReplicaBlock.failedCommandIdsRemoved) {
          tx.delete(sessionFailedCommandDrizzleSchema)
            .where(eq(sessionFailedCommandDrizzleSchema.id, commandId))
            .run();
        }
        for (const commandId of frontendReplicaBlock.optimisticAppliedMutationCommandIdsRemoved) {
          tx.delete(sessionOptimisticAppliedMutationDrizzleSchema)
            .where(
              eq(
                sessionOptimisticAppliedMutationDrizzleSchema.commandId,
                commandId,
              ),
            )
            .run();
        }

        for (const command of frontendReplicaBlock.stagedCommandsAdded) {
          upsertHelper({
            table: sessionStagedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaBlock.pushedCommandsAdded) {
          upsertHelper({
            table: sessionPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaBlock.executedPushedCommandsAdded) {
          upsertHelper({
            table: sessionExecutedPushedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const command of frontendReplicaBlock.failedStagedCommandsAdded) {
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: {
              ...command,
              pushedAt: null,
              accountCursor: null,
              accountIndex: null,
            },
          });
        }
        for (const command of frontendReplicaBlock.failedPushedCommandsAdded) {
          upsertHelper({
            table: sessionFailedCommandDrizzleSchema,
            tx,
            values: command,
          });
        }
        for (const optimisticRow of frontendReplicaBlock.optimisticAppliedMutationsAdded) {
          const encodedMutations = yield* Schema.encode(
            Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
          )(optimisticRow.mutations).pipe(
            mapParseError({
              code: 'session-optimistic-mutations-encode-failed',
              prefix: 'Failed to encode optimistic session mutations',
            }),
          );
          tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
            .values({
              commandId: optimisticRow.commandId,
              mutations: encodedMutations,
            })
            .onConflictDoUpdate({
              target: sessionOptimisticAppliedMutationDrizzleSchema.commandId,
              set: { mutations: encodedMutations },
            })
            .run();
        }
      }),
    });

    return 'applied';
  }

  const { lineageBlock } = frontendReplicaBlock;
  if (
    lineageBlock.systemId !== systemId ||
    lineageBlock.accountId !== accountId ||
    lineageBlock.accountName !== frontend.accountName ||
    lineageBlock.actorId !== actorId ||
    lineageBlock.actorName !== frontend.actorName ||
    lineageBlock.frontendName !== frontend.frontendName ||
    (lineageBlock.kind === 'generation-boundary'
      ? lineageBlock.frontendIndex
      : lineageBlock.frontendBlock.frontendIndex) !==
      frontendReplicaBlock.frontendIndex ||
    frontendReplicaBlock.frontendIndex !== currentFrontendIndex + 1
  ) {
    return yield* new ZerospinError({
      code: 'frontend-lineage-block-target-mismatch',
      message: 'Frontend lineage block does not match its replica envelope',
    });
  }

  if (lineageBlock.kind === 'generation-boundary') {
    if (
      lineageBlock.prevGenerationId !== generationId ||
      lineageBlock.generationId === generationId
    ) {
      return yield* new ZerospinError({
        code: 'frontend-generation-boundary-lineage-mismatch',
        message: 'Frontend generation boundary does not continue this replica',
      });
    }

    yield* makeTx({
      db,
      program: Effect.fn('applyFrontendBlock.generationBoundary')(function* () {
        yield* Effect.void;
      }),
    });
    return 'applied';
  }

  if (
    lineageBlock.generationId !== generationId ||
    lineageBlock.frontendBlock.frontendName !== frontend.frontendName ||
    lineageBlock.frontendBlock.frontendIndex !==
      frontendReplicaBlock.frontendIndex
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
        prefix: `Failed to decode deleted frontend lineage ref ${removedRef.modelName}.${removedRef.id}`,
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
    program: Effect.fn('applyFrontendBlock.server')(function* ({ tx }) {
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

  return 'applied';
});
