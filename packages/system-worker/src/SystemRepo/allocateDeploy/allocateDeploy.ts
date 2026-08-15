import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

export const allocateDeploy = Effect.fn('SystemRepo.allocateDeploy')(
  function* (props: {
    db: IDb;
    workerVersionId: string;
    clean: boolean;
    cleanRequestId: string | null;
    systemSpec: ISystemSpec;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      activeDeployId: AnyColumn;
      activatingDeployId: AnyColumn;
      lastCleanRequestId: AnyColumn;
    }>;
    deployTable: IAnyDrizzleSchema;
    deployColumns: Readonly<{
      id: AnyColumn;
      workerVersionId: AnyColumn;
      clean: AnyColumn;
      status: AnyColumn;
    }>;
  }) {
    if (props.workerVersionId.length === 0) {
      return yield* new ZerospinError({
        code: 'system-worker-version-id-missing',
        message: 'WORKER_VERSION_METADATA.id must be non-empty',
      });
    }
    const encodedSystemSpec = yield* Schema.encode(
      Schema.parseJson(SystemSpecSchema),
    )(props.systemSpec).pipe(
      mapParseError({
        code: 'system-deploy-system-spec-encode-failed',
        prefix: 'Failed to encode the deploy SystemSpec',
        extra: { workerVersionId: props.workerVersionId },
      }),
    );
    const selectionId = 'sctl_system';

    yield* Effect.try({
      try: () =>
        props.db
          .insert(props.selectionTable)
          .values({
            id: selectionId,
            activeDeployId: null,
            activatingDeployId: null,
            writeGenerationId: null,
            lastWriteIndex: 0,
            lastCleanRequestId: null,
          })
          .onConflictDoNothing()
          .run(),
      catch: ZerospinError.catch({
        code: 'system-selection-initialize-failed',
        message: 'Failed to initialize SystemRepo selection',
      }),
    });

    while (true) {
      const rawSelection = yield* Effect.try({
        try: () =>
          props.db
            .select()
            .from(props.selectionTable)
            .where(eq(props.selectionColumns.id, selectionId))
            .get(),
        catch: ZerospinError.catch({
          code: 'system-selection-read-failed',
          message: 'Failed to read SystemRepo selection during allocation',
          extra: { workerVersionId: props.workerVersionId },
        }),
      });
      const selection = yield* Schema.decodeUnknown(
        Schema.Struct({
          activeDeployId: Schema.NullOr(Schema.String),
          activatingDeployId: Schema.NullOr(Schema.String),
          lastCleanRequestId: Schema.NullOr(Schema.String),
        }),
      )(rawSelection).pipe(
        mapParseError({
          code: 'system-selection-invalid',
          prefix: 'Stored SystemRepo selection is invalid',
          extra: { workerVersionId: props.workerVersionId },
        }),
      );

      const rawExistingClean =
        props.clean || props.cleanRequestId !== null
          ? yield* Effect.try({
              try: () =>
                props.db
                  .select()
                  .from(props.deployTable)
                  .where(
                    and(
                      eq(
                        props.deployColumns.workerVersionId,
                        props.workerVersionId,
                      ),
                      eq(props.deployColumns.clean, true),
                    ),
                  )
                  .get(),
              catch: ZerospinError.catch({
                code: 'system-deploy-identity-read-failed',
                message: 'Failed to read the idempotent deploy identity',
                extra: {
                  workerVersionId: props.workerVersionId,
                  clean: true,
                },
              }),
            })
          : undefined;
      const clean =
        rawExistingClean !== undefined ||
        props.clean ||
        (props.cleanRequestId !== null &&
          props.cleanRequestId !== selection.lastCleanRequestId);
      const rawExisting =
        rawExistingClean ??
        (clean
          ? undefined
          : yield* Effect.try({
              try: () =>
                props.db
                  .select()
                  .from(props.deployTable)
                  .where(
                    and(
                      eq(
                        props.deployColumns.workerVersionId,
                        props.workerVersionId,
                      ),
                      eq(props.deployColumns.clean, false),
                    ),
                  )
                  .get(),
              catch: ZerospinError.catch({
                code: 'system-deploy-identity-read-failed',
                message: 'Failed to read the idempotent deploy identity',
                extra: {
                  workerVersionId: props.workerVersionId,
                  clean: false,
                },
              }),
            }));
      if (rawExisting !== undefined) {
        const existing = yield* Schema.decodeUnknown(
          Schema.Struct({
            id: Schema.String,
            workerVersionId: Schema.String,
            systemSpec: Schema.String,
            clean: Schema.Boolean,
          }),
        )(rawExisting).pipe(
          mapParseError({
            code: 'system-deploy-row-invalid',
            prefix: 'Stored deploy identity is invalid',
            extra: { workerVersionId: props.workerVersionId, clean },
          }),
        );
        if (
          existing.workerVersionId !== props.workerVersionId ||
          existing.clean !== clean ||
          existing.systemSpec !== encodedSystemSpec
        ) {
          return yield* new ZerospinError({
            code: 'system-deploy-identity-mismatch',
            message:
              'The stored deploy identity or SystemSpec does not match the requested deploy',
            extra: {
              deployId: existing.id,
              storedWorkerVersionId: existing.workerVersionId,
              executingWorkerVersionId: props.workerVersionId,
              storedClean: existing.clean,
              requestedClean: clean,
            },
          });
        }
        return { deployId: existing.id };
      }

      const rawActivating =
        selection.activatingDeployId === null
          ? undefined
          : yield* Effect.try({
              try: () =>
                props.db
                  .select()
                  .from(props.deployTable)
                  .where(
                    eq(props.deployColumns.id, selection.activatingDeployId),
                  )
                  .get(),
              catch: ZerospinError.catch({
                code: 'system-activating-deploy-read-failed',
                message: 'Failed to read the activating deploy',
                extra: {
                  activatingDeployId: selection.activatingDeployId,
                  workerVersionId: props.workerVersionId,
                },
              }),
            });
      if (
        selection.activatingDeployId !== null &&
        rawActivating === undefined
      ) {
        return yield* new ZerospinError({
          code: 'system-activating-deploy-missing',
          message: 'SystemRepo selection points to a missing activating deploy',
          extra: { activatingDeployId: selection.activatingDeployId },
        });
      }
      const activating =
        rawActivating === undefined
          ? null
          : yield* Schema.decodeUnknown(
              Schema.Struct({
                id: Schema.String,
                workerVersionId: Schema.String,
                status: Schema.Literal('activating', 'succeeded', 'failed'),
              }),
            )(rawActivating).pipe(
              mapParseError({
                code: 'system-activating-deploy-invalid',
                prefix: 'Stored activating deploy is invalid',
                extra: { activatingDeployId: selection.activatingDeployId },
              }),
            );
      if (activating !== null && activating.status === 'activating' && !clean) {
        return yield* new ZerospinError({
          code: 'system-deploy-activation-in-progress',
          message: 'A non-clean deploy cannot supersede the current activation',
          extra: {
            activatingDeployId: activating.id,
            activatingWorkerVersionId: activating.workerVersionId,
            executingWorkerVersionId: props.workerVersionId,
          },
        });
      }

      const rawActive =
        selection.activeDeployId === null
          ? undefined
          : yield* Effect.try({
              try: () =>
                props.db
                  .select()
                  .from(props.deployTable)
                  .where(eq(props.deployColumns.id, selection.activeDeployId))
                  .get(),
              catch: ZerospinError.catch({
                code: 'system-active-deploy-read-failed',
                message: 'Failed to read the active deploy during allocation',
                extra: { activeDeployId: selection.activeDeployId },
              }),
            });
      if (selection.activeDeployId !== null && rawActive === undefined) {
        return yield* new ZerospinError({
          code: 'system-active-deploy-missing',
          message: 'SystemRepo selection points to a missing active deploy',
          extra: { activeDeployId: selection.activeDeployId },
        });
      }
      const active =
        rawActive === undefined
          ? null
          : yield* Schema.decodeUnknown(
              Schema.Struct({
                id: Schema.String,
                generationId: Schema.String,
                status: Schema.Literal('activating', 'succeeded', 'failed'),
                systemSpec: Schema.String,
              }),
            )(rawActive).pipe(
              mapParseError({
                code: 'system-active-deploy-invalid',
                prefix: 'Stored active deploy is invalid',
                extra: { activeDeployId: selection.activeDeployId },
              }),
            );
      if (active !== null && active.status !== 'succeeded') {
        return yield* new ZerospinError({
          code: 'system-active-deploy-not-succeeded',
          message: 'Only a succeeded deploy may be selected as active',
          extra: { activeDeployId: active.id, status: active.status },
        });
      }

      const activeSystemSpec =
        active === null
          ? null
          : yield* Schema.decodeUnknown(Schema.parseJson(SystemSpecSchema))(
              active.systemSpec,
            ).pipe(
              mapParseError({
                code: 'system-active-deploy-system-spec-invalid',
                prefix: 'Stored active deploy SystemSpec is invalid',
                extra: { activeDeployId: active.id },
              }),
            );
      const compatibility =
        activeSystemSpec === null || clean
          ? null
          : yield* checkSystemCompatibility({
              prior: activeSystemSpec,
              next: props.systemSpec,
            });
      const blockingDiff = compatibility?.diffs.find(diff =>
        [
          'identity-changed',
          'invalid-semver',
          'version-under-bumped',
          'frontend-exact-definition-removed',
          'frontend-exact-definition-mutated',
          'required-adapters-missing',
        ].includes(diff.kind),
      );
      const requiresNewGeneration =
        active === null ||
        clean ||
        compatibility?.requiresNewGeneration === true;
      const deployId = yield* makeIdFromAbbreviation({ abbreviation: 'dpl' });
      const generationId = requiresNewGeneration
        ? yield* makeIdFromAbbreviation({ abbreviation: 'gen' })
        : active.generationId;
      const supersededFailure = yield* Schema.encode(
        Schema.parseJson(ZerospinError.schema),
      )(
        new ZerospinError({
          code: 'system-deploy-superseded-by-clean',
          message: 'A clean deploy superseded this activation',
          extra: { replacementDeployId: deployId },
        }),
      ).pipe(
        mapParseError({
          code: 'system-deploy-superseded-failure-encode-failed',
          prefix: 'Failed to encode clean supersession failure',
          extra: { deployId },
        }),
      );
      const incompatibleFailure =
        blockingDiff === undefined
          ? null
          : yield* Schema.encode(Schema.parseJson(ZerospinError.schema))(
              new ZerospinError({
                code: 'system-deploy-incompatible',
                message: 'The candidate SystemSpec is not deploy-compatible',
                extra: { diff: blockingDiff },
              }),
            ).pipe(
              mapParseError({
                code: 'system-deploy-incompatible-failure-encode-failed',
                prefix: 'Failed to encode incompatible deploy failure',
                extra: { deployId },
              }),
            );

      const allocated = yield* Effect.try({
        try: () =>
          props.db.transaction(tx => {
            const latestSelection = tx
              .select({
                activeDeployId: props.selectionColumns.activeDeployId,
                activatingDeployId: props.selectionColumns.activatingDeployId,
                lastCleanRequestId: props.selectionColumns.lastCleanRequestId,
              })
              .from(props.selectionTable)
              .where(eq(props.selectionColumns.id, selectionId))
              .get();
            if (
              latestSelection === undefined ||
              latestSelection.activeDeployId !== selection.activeDeployId ||
              latestSelection.activatingDeployId !==
                selection.activatingDeployId ||
              latestSelection.lastCleanRequestId !==
                selection.lastCleanRequestId
            ) {
              return null;
            }
            const racedExisting = tx
              .select({ id: props.deployColumns.id })
              .from(props.deployTable)
              .where(
                and(
                  eq(
                    props.deployColumns.workerVersionId,
                    props.workerVersionId,
                  ),
                  eq(props.deployColumns.clean, clean),
                ),
              )
              .get();
            if (racedExisting !== undefined) {
              return null;
            }

            if (
              clean &&
              activating !== null &&
              activating.status === 'activating'
            ) {
              tx.update(props.deployTable)
                .set({
                  status: 'failed',
                  failure: supersededFailure,
                  completedAt: new Date(),
                })
                .where(
                  and(
                    eq(props.deployColumns.id, activating.id),
                    eq(props.deployColumns.status, 'activating'),
                  ),
                )
                .run();
            }

            tx.insert(props.deployTable)
              .values({
                id: deployId,
                prevDeployId: active?.id ?? null,
                generationId,
                workerVersionId: props.workerVersionId,
                systemSpec: encodedSystemSpec,
                clean,
                status: incompatibleFailure === null ? 'activating' : 'failed',
                activationCheckpoint: 'allocated',
                failure: incompatibleFailure,
                startedAt: new Date(),
                completedAt: incompatibleFailure === null ? null : new Date(),
              })
              .run();
            tx.update(props.selectionTable)
              .set({
                activatingDeployId:
                  incompatibleFailure === null
                    ? deployId
                    : selection.activatingDeployId,
              })
              .where(eq(props.selectionColumns.id, selectionId))
              .run();
            return { deployId };
          }),
        catch: ZerospinError.catch({
          code: 'system-deploy-allocation-failed',
          message: 'Failed to allocate the deploy',
          extra: { workerVersionId: props.workerVersionId, clean },
        }),
      });
      if (allocated !== null) {
        return allocated;
      }
    }
  },
);
