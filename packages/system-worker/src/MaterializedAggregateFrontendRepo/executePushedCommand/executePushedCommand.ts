import { applyAggregateFrontendMutationTx } from '@zerospin/core/contracts/applyAggregateFrontendMutationTx';
import { decodeAppliedMutation } from '@zerospin/core/contracts/decodeAppliedMutation';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '@zerospin/core/contracts/encodeAppliedMutation';
import type {
  IChainedCommand,
  IEncodedAppliedMutation,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IEncodedResourceShape, IRef } from '@zerospin/core/models/types';
import {
  AggregateFrontendPushedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IFrontendDelta } from '@zerospin/core/session/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, or, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { system } from 'system';

import { materializedAggregateFrontendRepoDrizzleSchemas } from '../MaterializedAggregateFrontendRepoDbConfig.js';

export const executePushedCommand = Effect.fn(
  'MaterializedAggregateFrontendRepo.executePushedCommand',
)(function* (props: {
  chainedAt: Date;
  command: IEncodedCommand<
    IChainedCommand<ISessionCommand, IFrontendDelta> &
      Readonly<{ sessionIndex: number; pushIndex: null }>
  >;
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  pushIndex: number;
}) {
  const { chainedAt, command, db, key, pushIndex } = props;
  if (
    command.aggregateId !== key.aggregateId ||
    command.aggregateName !== key.aggregateName ||
    command.userId !== key.userId ||
    command.frontendName !== key.frontendName ||
    command.pushIndex !== null ||
    command.delta === null ||
    !Number.isSafeInteger(pushIndex) ||
    pushIndex < 1
  ) {
    return yield* new ZerospinError({
      code: 'materialized-aggregate-frontend-pushed-command-target-mismatch',
      message:
        'Committed local command does not match its bound materialized frontend target',
    });
  }
  const sourceDelta = command.delta;
  const {
    sessionIndex: _sessionIndex,
    pushIndex: _pushIndex,
    ...sessionCommand
  } = command;
  const sourceCanonicalBytes = yield* Schema.encodeEffect(
    Schema.fromJsonString(SessionCommandSchema),
  )(command).pipe(
    mapParseError({
      code: 'materialized-aggregate-frontend-pushed-source-encode-failed',
      prefix: `Failed to encode pushed source command ${command.id}`,
    }),
  );
  const existingRows = db
    .select()
    .from(materializedAggregateFrontendRepoDrizzleSchemas.pushedExecutionClaims)
    .where(
      or(
        eq(
          materializedAggregateFrontendRepoDrizzleSchemas.pushedExecutionClaims
            .pushIndex,
          pushIndex,
        ),
        eq(
          materializedAggregateFrontendRepoDrizzleSchemas.pushedExecutionClaims
            .commandId,
          command.id,
        ),
      ),
    )
    .all();
  if (existingRows.length > 1) {
    return yield* new ZerospinError({
      code: 'materialized-aggregate-frontend-pushed-claim-conflict',
      message:
        'Push index and command ID resolve to different execution claims',
    });
  }
  const existing = existingRows[0];
  if (existing !== undefined) {
    if (
      existing.pushIndex !== pushIndex ||
      existing.commandId !== command.id ||
      existing.sourceCanonicalBytes !== sourceCanonicalBytes ||
      existing.chainedAt.getTime() !== chainedAt.getTime()
    ) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-pushed-claim-conflict',
        message:
          'Retained pushed execution claim has different canonical bytes',
      });
    }
    if (existing.result === null) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-pushed-execution-in-doubt',
        message:
          'A retained pushed execution claim has no terminal result and requires repair',
      });
    }
    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(AggregateFrontendPushedCommandSchema),
    )(existing.result).pipe(
      mapParseError({
        code: 'materialized-aggregate-frontend-pushed-result-invalid',
        prefix: `Failed to decode retained pushed result ${pushIndex}`,
      }),
    );
  }

  yield* Effect.try({
    try: () =>
      db.transaction(tx => {
        const state = tx
          .select()
          .from(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
          .where(
            eq(
              materializedAggregateFrontendRepoDrizzleSchemas.projectionState
                .id,
              1,
            ),
          )
          .get();
        if (state === undefined || state.status !== 'ready') {
          throw new ZerospinError({
            code: 'materialized-aggregate-frontend-not-ready',
            message: 'Materialized aggregate frontend is not ready for pushes',
          });
        }
        if (
          state.systemId !== key.systemId ||
          state.aggregateId !== key.aggregateId ||
          state.aggregateName !== key.aggregateName ||
          state.userId !== key.userId ||
          state.frontendName !== key.frontendName
        ) {
          throw new ZerospinError({
            code: 'materialized-aggregate-frontend-state-target-mismatch',
            message: 'Persisted projection state belongs to another target',
          });
        }
        if (pushIndex !== state.pushIndex + 1) {
          throw new ZerospinError({
            code: 'materialized-aggregate-frontend-pushed-index-gap',
            message: `Expected pushIndex ${state.pushIndex + 1}, received ${pushIndex}`,
          });
        }
        tx.insert(
          materializedAggregateFrontendRepoDrizzleSchemas.pushedExecutionClaims,
        )
          .values({
            pushIndex,
            commandId: command.id,
            sourceCanonicalBytes,
            sourceCommand: sourceCanonicalBytes,
            chainedAt,
            claimedAt: new Date(),
            result: null,
          })
          .run();
      }),
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'materialized-aggregate-frontend-pushed-claim-write-failed',
            message: `Failed to claim pushed execution ${pushIndex}`,
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });

  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: key.aggregateName,
    recordKind: 'aggregates',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: key.frontendName,
    recordKind: `frontends owned by aggregate ${key.aggregateName}`,
  });
  const frontendModels = frontendBinding.controller.models;

  return yield* makeTx({
    db,
    program: Effect.fn(
      'MaterializedAggregateFrontendRepo.executePushedCommand.transaction',
    )(function* ({ tx }) {
      yield* Effect.sync(() => {
        tx.run(sql.raw('PRAGMA defer_foreign_keys = ON'));
      });
      const before = new Map<string, IEncodedResourceShape | undefined>();
      const refs = new Map<string, IRef>();
      const applied =
        command.failedAt !== null
          ? Result.fail(
              new ZerospinError({
                code: 'materialized-aggregate-frontend-local-command-failed',
                message: `Committed local command ${command.id} failed before push`,
              }),
            )
          : yield* withSavepoint({
              tx,
              program: Effect.fn(
                'MaterializedAggregateFrontendRepo.executePushedCommand.apply',
              )(function* ({ tx: commandTx }) {
                const currentInverses: IEncodedAppliedMutation[] = [];
                for (const mutation of sourceDelta.mutations) {
                  const model = yield* getByKeyOrThrow({
                    record: frontendModels,
                    key: mutation.modelName,
                    recordKind: 'frontend models',
                  });
                  const resourceKey = `${mutation.modelName}\u0000${mutation.resourceId}`;
                  if (!before.has(resourceKey)) {
                    const row = commandTx
                      .select()
                      .from(model.drizzleSchema)
                      .where(eq(model.drizzleSchema.id, mutation.resourceId))
                      .get();
                    before.set(
                      resourceKey,
                      row === undefined
                        ? undefined
                        : yield* Schema.decodeEffect(
                            Schema.toType(EncodedResourceSchema),
                          )(row).pipe(
                            mapParseError({
                              code: 'materialized-aggregate-frontend-pushed-before-resource-invalid',
                              prefix: `Failed to decode optimistic resource ${mutation.modelName}.${mutation.resourceId}`,
                            }),
                          ),
                    );
                    refs.set(resourceKey, {
                      id: mutation.resourceId,
                      modelName: mutation.modelName,
                    });
                  }
                  const decodedMutation = yield* decodeAppliedMutation({
                    mutation,
                    model,
                  });
                  const nextAppliedMutation =
                    yield* applyAggregateFrontendMutationTx({
                      tx: commandTx,
                      mutation: decodedMutation,
                      commandId: command.id,
                      mutationIndex: mutation.mutationIndex,
                      appliedAt: chainedAt,
                    });
                  currentInverses.push(
                    yield* encodeAppliedMutation({
                      mutation: nextAppliedMutation,
                    }),
                  );
                }
                return currentInverses;
              }),
            }).pipe(Effect.result);

      const inserted: IEncodedResourceShape[] = [];
      const updated: IEncodedResourceShape[] = [];
      const deleted: IRef[] = [];
      if (Result.isSuccess(applied)) {
        for (const [resourceKey, ref] of refs) {
          const model = yield* getByKeyOrThrow({
            record: frontendModels,
            key: ref.modelName,
            recordKind: 'frontend models',
          });
          const row = tx
            .select()
            .from(model.drizzleSchema)
            .where(eq(model.drizzleSchema.id, ref.id))
            .get();
          const previous = before.get(resourceKey);
          if (row === undefined) {
            if (previous !== undefined) deleted.push(ref);
            continue;
          }
          const resource = yield* Schema.decodeEffect(
            Schema.toType(EncodedResourceSchema),
          )(row).pipe(
            mapParseError({
              code: 'materialized-aggregate-frontend-pushed-resource-invalid',
              prefix: `Failed to encode optimistic resource ${ref.modelName}.${ref.id}`,
            }),
          );
          if (previous === undefined) inserted.push(resource);
          else updated.push(resource);
        }
      }

      const terminal = yield* Schema.decodeUnknownEffect(
        Schema.toType(AggregateFrontendPushedCommandSchema),
      )(
        Result.isSuccess(applied)
          ? {
              ...sessionCommand,
              pushIndex,
              chainedAt,
              delta: {
                inserted,
                updated,
                deleted,
                mutations: applied.success,
              },
              failedAt: null,
              failure: null,
            }
          : {
              ...sessionCommand,
              pushIndex,
              chainedAt,
              delta: { inserted: [], updated: [], deleted: [], mutations: [] },
              failedAt: chainedAt,
              failure:
                command.failedAt === null
                  ? yield* Schema.encodeUnknownEffect(ZerospinError.schema)(
                      applied.failure,
                    ).pipe(
                      mapParseError({
                        code: 'materialized-aggregate-frontend-pushed-failure-encode-failed',
                        prefix: `Failed to encode pushed failure ${pushIndex}`,
                      }),
                    )
                  : command.failure,
            },
        { onExcessProperty: 'error' },
      ).pipe(
        mapParseError({
          code: 'materialized-aggregate-frontend-pushed-terminal-invalid',
          prefix: `Failed to create pushed result ${pushIndex}`,
        }),
      );
      const resultBytes = yield* Schema.encodeEffect(
        Schema.fromJsonString(AggregateFrontendPushedCommandSchema),
      )(terminal).pipe(
        mapParseError({
          code: 'materialized-aggregate-frontend-pushed-result-encode-failed',
          prefix: `Failed to encode pushed result ${pushIndex}`,
        }),
      );
      const forwardMutations = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
      )(sourceDelta.mutations).pipe(
        mapParseError({
          code: 'materialized-aggregate-frontend-pushed-forward-mutations-encode-failed',
          prefix: `Failed to encode forward mutations ${pushIndex}`,
        }),
      );
      const currentInverses = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Array(EncodedAppliedMutationSchema)),
      )(Result.isSuccess(applied) ? applied.success : []).pipe(
        mapParseError({
          code: 'materialized-aggregate-frontend-pushed-inverses-encode-failed',
          prefix: `Failed to encode current inverses ${pushIndex}`,
        }),
      );
      const claim = tx
        .select()
        .from(
          materializedAggregateFrontendRepoDrizzleSchemas.pushedExecutionClaims,
        )
        .where(
          eq(
            materializedAggregateFrontendRepoDrizzleSchemas
              .pushedExecutionClaims.pushIndex,
            pushIndex,
          ),
        )
        .get();
      if (
        claim === undefined ||
        claim.result !== null ||
        claim.sourceCanonicalBytes !== sourceCanonicalBytes
      ) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-frontend-pushed-terminal-conflict',
          message: `Execution claim ${pushIndex} changed before terminal commit`,
        });
      }
      tx.update(
        materializedAggregateFrontendRepoDrizzleSchemas.pushedExecutionClaims,
      )
        .set({ result: resultBytes })
        .where(
          eq(
            materializedAggregateFrontendRepoDrizzleSchemas
              .pushedExecutionClaims.pushIndex,
            pushIndex,
          ),
        )
        .run();
      tx.update(materializedAggregateFrontendRepoDrizzleSchemas.projectionState)
        .set({ pushIndex })
        .where(
          eq(
            materializedAggregateFrontendRepoDrizzleSchemas.projectionState.id,
            1,
          ),
        )
        .run();
      if (terminal.failedAt === null) {
        tx.insert(
          materializedAggregateFrontendRepoDrizzleSchemas.activeOptimism,
        )
          .values({
            pushIndex,
            commandId: command.id,
            command: resultBytes,
            forwardMutations,
            currentInverses,
          })
          .run();
      }
      return terminal;
    }),
  });
});
