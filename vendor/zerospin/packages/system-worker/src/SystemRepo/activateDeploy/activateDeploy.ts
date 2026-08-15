/*
 * System-worker annotation:
 * Resumes generation activation from durable checkpoints through continuous
 * replay, the irreversible ownership cut, fixed-point proof, and promotion.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { seeds } from 'seeds';

import { AggregateBlockRepo } from '../../AggregateBlockRepo/AggregateBlockRepo.js';
import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { AggregateRepo } from '../../AggregateRepo/AggregateRepo.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../../ServiceBlockRepo/ServiceBlockRepo.js';
import { freezeGeneration } from '../freezeGeneration/freezeGeneration.js';
import { openGeneration } from '../openGeneration/openGeneration.js';
import { prepareGeneration } from '../prepareGeneration/prepareGeneration.js';
import { retireGeneration } from '../retireGeneration/retireGeneration.js';

const ActivationCheckpoint = Schema.Literal(
  'allocated',
  'generation-prepared',
  'continuous-replay',
  'pre-cut-ready',
  'ownership-cut',
  'source-writes-terminal',
  'fixed-point-drained',
  'final-replay-complete',
);

export const activateDeploy = Effect.fn('SystemRepo.activateDeploy')(
  function* (props: {
    db: IDb;
    configuredSystemId: string;
    executingWorkerVersionId: string;
    deployId: string;
    cleanRequestId: string | null;
    submitTargetedSeed: (props: {
      generationId: string;
      seed: IDeploySeedCommand;
    }) => Effect.Effect<void, IAnyError, Async>;
    drainSystemWrites: (props: {
      generationId: string;
      throughWriteIndex: number | null;
      includeHeld?: true;
    }) => Effect.Effect<void, IAnyError, Async>;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      activeDeployId: AnyColumn;
      activatingDeployId: AnyColumn;
      writeGenerationId: AnyColumn;
      lastCleanRequestId: AnyColumn;
    }>;
    deployTable: IAnyDrizzleSchema;
    deployColumns: Readonly<{
      id: AnyColumn;
      prevDeployId: AnyColumn;
      status: AnyColumn;
      activationCheckpoint: AnyColumn;
    }>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      drainFrozenAt: AnyColumn;
      generationId: AnyColumn;
      lastWriteIndex: AnyColumn;
      phase: AnyColumn;
      preparingDeployId: AnyColumn;
      successorGenerationId: AnyColumn;
    }>;
    drainBoundsTable: IAnyDrizzleSchema;
    drainBoundsColumns: Readonly<{
      generationId: AnyColumn;
      repoType: AnyColumn;
      sourceRepoName: AnyColumn;
      targetRepoName: AnyColumn;
    }>;
    replayCompletionsTable: IAnyDrizzleSchema;
    replayCompletionsColumns: Readonly<{
      generationId: AnyColumn;
      targetRepoName: AnyColumn;
    }>;
    repoTable: IAnyDrizzleSchema & {
      generationId: AnyColumn;
      repoType: AnyColumn;
      repoName: AnyColumn;
      tableNames: AnyColumn;
    };
  }) {
    const selectionId = 'sctl_system';
    let lastCheckpoint: Schema.Schema.Type<typeof ActivationCheckpoint> | null =
      null;

    return yield* Effect.gen(function* () {
      while (true) {
        const rawCandidate = props.db
          .select()
          .from(props.deployTable)
          .where(eq(props.deployColumns.id, props.deployId))
          .get();
        if (rawCandidate === undefined) {
          return yield* new ZerospinError({
            code: 'system-activating-deploy-missing',
            message: 'The deploy being activated does not exist',
            extra: { deployId: props.deployId },
          });
        }
        const candidate = yield* Schema.decodeUnknown(
          Schema.Struct({
            id: Schema.String,
            prevDeployId: Schema.NullOr(Schema.String),
            generationId: Schema.String,
            workerVersionId: Schema.String,
            systemSpec: Schema.String,
            clean: Schema.Boolean,
            status: Schema.Literal('activating', 'succeeded', 'failed'),
            activationCheckpoint: ActivationCheckpoint,
          }),
        )(rawCandidate).pipe(
          mapParseError({
            code: 'system-activating-deploy-invalid',
            prefix: 'Stored activating deploy is invalid',
            extra: { deployId: props.deployId },
          }),
        );
        lastCheckpoint = candidate.activationCheckpoint;
        if (candidate.status !== 'activating') {
          return;
        }

        const selection = props.db
          .select()
          .from(props.selectionTable)
          .where(eq(props.selectionColumns.id, selectionId))
          .get();
        if (selection === undefined) {
          return yield* new ZerospinError({
            code: 'system-activation-selection-missing',
            message: 'SystemRepo selection is missing during activation',
            extra: { deployId: candidate.id },
          });
        }
        if (selection.activatingDeployId !== candidate.id) {
          return;
        }
        if (candidate.workerVersionId !== props.executingWorkerVersionId) {
          return yield* new ZerospinError({
            code: 'system-deploy-worker-version-mismatch',
            message: 'A different Worker bundle cannot resume this deploy',
            extra: {
              deployId: candidate.id,
              candidateWorkerVersionId: candidate.workerVersionId,
              executingWorkerVersionId: props.executingWorkerVersionId,
            },
          });
        }

        const activationGuard = Effect.sync(() => {
          const latestDeploy = props.db
            .select()
            .from(props.deployTable)
            .where(eq(props.deployColumns.id, candidate.id))
            .get();
          const latestSelection = props.db
            .select()
            .from(props.selectionTable)
            .where(eq(props.selectionColumns.id, selectionId))
            .get();
          return (
            latestDeploy?.status === 'activating' &&
            latestDeploy.activationCheckpoint ===
              candidate.activationCheckpoint &&
            latestSelection?.activatingDeployId === candidate.id
          );
        }).pipe(
          Effect.flatMap(current => (current ? Effect.void : Effect.interrupt)),
        );
        const systemSpec = yield* Schema.decodeUnknown(
          Schema.parseJson(SystemSpecSchema),
        )(candidate.systemSpec).pipe(
          mapParseError({
            code: 'system-deploy-system-spec-invalid',
            prefix: 'Stored deploy SystemSpec is invalid',
            extra: { deployId: candidate.id },
          }),
        );

        const rawOrigin =
          candidate.prevDeployId === null
            ? undefined
            : props.db
                .select()
                .from(props.deployTable)
                .where(eq(props.deployColumns.id, candidate.prevDeployId))
                .get();
        if (candidate.prevDeployId !== null && rawOrigin === undefined) {
          return yield* new ZerospinError({
            code: 'system-origin-deploy-missing',
            message: 'The activation origin deploy does not exist',
            extra: { deployId: candidate.id },
          });
        }
        const origin =
          rawOrigin === undefined
            ? null
            : yield* Schema.decodeUnknown(
                Schema.Struct({
                  id: Schema.String,
                  generationId: Schema.String,
                  status: Schema.Literal('activating', 'succeeded', 'failed'),
                }),
              )(rawOrigin).pipe(
                mapParseError({
                  code: 'system-origin-deploy-invalid',
                  prefix: 'Stored origin deploy is invalid',
                  extra: { deployId: candidate.id },
                }),
              );
        if (origin !== null && origin.status !== 'succeeded') {
          return yield* new ZerospinError({
            code: 'system-origin-deploy-not-succeeded',
            message: 'The activation origin is not a succeeded deploy',
            extra: { deployId: candidate.id, originDeployId: origin.id },
          });
        }

        const linked =
          origin !== null &&
          origin.generationId !== candidate.generationId &&
          !candidate.clean;
        const compatible =
          origin !== null &&
          origin.generationId === candidate.generationId &&
          !candidate.clean;

        if (candidate.activationCheckpoint === 'allocated') {
          if (candidate.clean && origin !== null) {
            yield* cleanOwnershipCut({
              ...props,
              selectionId,
              candidateDeployId: candidate.id,
              originDeployId: origin.id,
              originGenerationId: origin.generationId,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'allocated',
              to: 'ownership-cut',
            });
            continue;
          }
          const preparationSeeds =
            origin === null || candidate.clean
              ? yield* seeds.pipe(
                  Effect.mapError(
                    failure =>
                      new ZerospinError({
                        code: 'generation-seed-evaluation-failed',
                        message: 'Failed to evaluate deploy seeds',
                        cause: ZerospinError.prettyUnknownFailure(failure),
                        extra: {
                          deployId: candidate.id,
                          generationId: candidate.generationId,
                        },
                      }),
                  ),
                )
              : [];
          yield* prepareGeneration({
            db: props.db,
            activationGuard,
            configuredSystemId: props.configuredSystemId,
            deployId: candidate.id,
            generationId: candidate.generationId,
            prevGenerationId: linked ? (origin?.generationId ?? null) : null,
            restoreSubscriptions: false,
            systemSpec,
            seeds: preparationSeeds,
            submitTargetedSeed: props.submitTargetedSeed,
            drainSystemWrites: props.drainSystemWrites,
            generationStateTable: props.generationStateTable,
            generationStateColumns: props.generationStateColumns,
            replayCompletionsTable: props.replayCompletionsTable,
            replayCompletionsColumns: props.replayCompletionsColumns,
            repoTable: props.repoTable,
          });
          yield* setCheckpoint({
            ...props,
            selectionId,
            deployId: candidate.id,
            from: 'allocated',
            to: 'generation-prepared',
          });
          continue;
        }

        if (candidate.activationCheckpoint === 'generation-prepared') {
          if (linked && origin !== null) {
            yield* prepareGeneration({
              db: props.db,
              activationGuard,
              configuredSystemId: props.configuredSystemId,
              deployId: candidate.id,
              generationId: candidate.generationId,
              prevGenerationId: origin.generationId,
              restoreSubscriptions: false,
              systemSpec,
              seeds: [],
              submitTargetedSeed: props.submitTargetedSeed,
              drainSystemWrites: props.drainSystemWrites,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              replayCompletionsTable: props.replayCompletionsTable,
              replayCompletionsColumns: props.replayCompletionsColumns,
              repoTable: props.repoTable,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'generation-prepared',
              to: 'continuous-replay',
            });
            continue;
          }

          if (compatible) {
            yield* promote({
              ...props,
              selectionId,
              candidate,
              origin: null,
              expectedCheckpoint: 'generation-prepared',
            });
            return;
          }

          // A closed initial root proves seed consequences before it opens.
          yield* freezeGeneration({
            db: props.db,
            activationGuard,
            deployId: candidate.id,
            generationId: candidate.generationId,
            throughWriteIndex: null,
            drainSystemWrites: props.drainSystemWrites,
            generationStateTable: props.generationStateTable,
            generationStateColumns: props.generationStateColumns,
            drainBoundsTable: props.drainBoundsTable,
            drainBoundsColumns: props.drainBoundsColumns,
            repoTable: props.repoTable,
          });
          yield* setCheckpoint({
            ...props,
            selectionId,
            deployId: candidate.id,
            from: 'generation-prepared',
            to: 'final-replay-complete',
          });
          continue;
        }

        if (candidate.clean && origin !== null) {
          if (candidate.activationCheckpoint === 'ownership-cut') {
            const displacedBranches = (yield* readCleanBranches({
              db: props.db,
              deployId: candidate.id,
              targetGenerationId: candidate.generationId,
              generationStateTable: props.generationStateTable,
            })).filter(
              branch => branch.phase === 'open' || branch.phase === 'draining',
            );
            for (const branch of displacedBranches) {
              if (
                branch.phase !== 'draining' ||
                branch.activeDeployId === null
              ) {
                return yield* new ZerospinError({
                  code: 'system-clean-drain-branch-invalid',
                  message:
                    'A clean takeover found a displaced writable branch outside draining',
                  extra: {
                    deployId: candidate.id,
                    generationId: branch.generationId,
                    phase: branch.phase,
                    activeDeployId: branch.activeDeployId,
                  },
                });
              }
              yield* props.drainSystemWrites({
                generationId: branch.generationId,
                throughWriteIndex: branch.lastWriteIndex,
              });
            }
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'ownership-cut',
              to: 'source-writes-terminal',
            });
            continue;
          }
          if (candidate.activationCheckpoint === 'source-writes-terminal') {
            while (true) {
              const displacedBranches = (yield* readCleanBranches({
                db: props.db,
                deployId: candidate.id,
                targetGenerationId: candidate.generationId,
                generationStateTable: props.generationStateTable,
              })).filter(
                branch =>
                  branch.phase === 'open' || branch.phase === 'draining',
              );
              const unfrozenBranch = displacedBranches.find(
                branch => branch.drainFrozenAt === null,
              );
              if (unfrozenBranch === undefined) {
                break;
              }
              if (
                unfrozenBranch.phase !== 'draining' ||
                unfrozenBranch.activeDeployId === null
              ) {
                return yield* new ZerospinError({
                  code: 'system-clean-freeze-branch-invalid',
                  message:
                    'A clean takeover found a displaced branch that cannot reach a fixed point',
                  extra: {
                    deployId: candidate.id,
                    generationId: unfrozenBranch.generationId,
                    phase: unfrozenBranch.phase,
                    activeDeployId: unfrozenBranch.activeDeployId,
                  },
                });
              }
              yield* freezeGeneration({
                db: props.db,
                activationGuard,
                deployId: unfrozenBranch.activeDeployId,
                generationId: unfrozenBranch.generationId,
                throughWriteIndex: unfrozenBranch.lastWriteIndex,
                drainSystemWrites: props.drainSystemWrites,
                generationStateTable: props.generationStateTable,
                generationStateColumns: props.generationStateColumns,
                drainBoundsTable: props.drainBoundsTable,
                drainBoundsColumns: props.drainBoundsColumns,
                repoTable: props.repoTable,
              });
            }
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'source-writes-terminal',
              to: 'fixed-point-drained',
            });
            continue;
          }
          if (candidate.activationCheckpoint === 'fixed-point-drained') {
            const cleanSeeds = yield* seeds.pipe(
              Effect.mapError(
                failure =>
                  new ZerospinError({
                    code: 'generation-seed-evaluation-failed',
                    message: 'Failed to evaluate clean deploy seeds',
                    cause: ZerospinError.prettyUnknownFailure(failure),
                    extra: {
                      deployId: candidate.id,
                      generationId: candidate.generationId,
                    },
                  }),
              ),
            );
            yield* prepareGeneration({
              db: props.db,
              activationGuard,
              configuredSystemId: props.configuredSystemId,
              deployId: candidate.id,
              generationId: candidate.generationId,
              prevGenerationId: null,
              restoreSubscriptions: false,
              systemSpec,
              seeds: cleanSeeds,
              submitTargetedSeed: props.submitTargetedSeed,
              drainSystemWrites: props.drainSystemWrites,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              replayCompletionsTable: props.replayCompletionsTable,
              replayCompletionsColumns: props.replayCompletionsColumns,
              repoTable: props.repoTable,
            });
            yield* freezeGeneration({
              db: props.db,
              activationGuard,
              deployId: candidate.id,
              generationId: candidate.generationId,
              throughWriteIndex: null,
              drainSystemWrites: props.drainSystemWrites,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              drainBoundsTable: props.drainBoundsTable,
              drainBoundsColumns: props.drainBoundsColumns,
              repoTable: props.repoTable,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'fixed-point-drained',
              to: 'final-replay-complete',
            });
            continue;
          }
        }

        if (linked && origin !== null) {
          if (candidate.activationCheckpoint === 'continuous-replay') {
            yield* prepareGeneration({
              db: props.db,
              activationGuard,
              configuredSystemId: props.configuredSystemId,
              deployId: candidate.id,
              generationId: candidate.generationId,
              prevGenerationId: origin.generationId,
              restoreSubscriptions: false,
              systemSpec,
              seeds: [],
              submitTargetedSeed: props.submitTargetedSeed,
              drainSystemWrites: props.drainSystemWrites,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              replayCompletionsTable: props.replayCompletionsTable,
              replayCompletionsColumns: props.replayCompletionsColumns,
              repoTable: props.repoTable,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'continuous-replay',
              to: 'pre-cut-ready',
            });
            continue;
          }
          if (candidate.activationCheckpoint === 'pre-cut-ready') {
            yield* ownershipCut({
              ...props,
              selectionId,
              candidateDeployId: candidate.id,
              originDeployId: origin.id,
              originGenerationId: origin.generationId,
              targetGenerationId: candidate.generationId,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'pre-cut-ready',
              to: 'ownership-cut',
            });
            continue;
          }
          if (candidate.activationCheckpoint === 'ownership-cut') {
            const source = props.db
              .select()
              .from(props.generationStateTable)
              .where(
                eq(
                  props.generationStateColumns.generationId,
                  origin.generationId,
                ),
              )
              .get();
            yield* props.drainSystemWrites({
              generationId: origin.generationId,
              throughWriteIndex: source?.lastWriteIndex ?? 0,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'ownership-cut',
              to: 'source-writes-terminal',
            });
            continue;
          }
          if (candidate.activationCheckpoint === 'source-writes-terminal') {
            const source = props.db
              .select()
              .from(props.generationStateTable)
              .where(
                eq(
                  props.generationStateColumns.generationId,
                  origin.generationId,
                ),
              )
              .get();
            yield* freezeGeneration({
              db: props.db,
              activationGuard,
              deployId: origin.id,
              generationId: origin.generationId,
              throughWriteIndex: source?.lastWriteIndex ?? 0,
              drainSystemWrites: props.drainSystemWrites,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              drainBoundsTable: props.drainBoundsTable,
              drainBoundsColumns: props.drainBoundsColumns,
              repoTable: props.repoTable,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'source-writes-terminal',
              to: 'fixed-point-drained',
            });
            continue;
          }
          if (candidate.activationCheckpoint === 'fixed-point-drained') {
            yield* prepareGeneration({
              db: props.db,
              activationGuard,
              configuredSystemId: props.configuredSystemId,
              deployId: candidate.id,
              generationId: candidate.generationId,
              prevGenerationId: origin.generationId,
              restoreSubscriptions: true,
              systemSpec,
              seeds: [],
              submitTargetedSeed: props.submitTargetedSeed,
              drainSystemWrites: props.drainSystemWrites,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              replayCompletionsTable: props.replayCompletionsTable,
              replayCompletionsColumns: props.replayCompletionsColumns,
              repoTable: props.repoTable,
            });
            yield* setCheckpoint({
              ...props,
              selectionId,
              deployId: candidate.id,
              from: 'fixed-point-drained',
              to: 'final-replay-complete',
            });
            continue;
          }
        }

        if (candidate.activationCheckpoint !== 'final-replay-complete') {
          return yield* new ZerospinError({
            code: 'system-deploy-checkpoint-invalid',
            message: 'The deploy reached an invalid activation checkpoint',
            extra: {
              deployId: candidate.id,
              activationCheckpoint: candidate.activationCheckpoint,
            },
          });
        }

        if (linked && origin !== null) {
          yield* assertFinalReplayProof({
            db: props.db,
            sourceGenerationId: origin.generationId,
            targetGenerationId: candidate.generationId,
            drainBoundsTable: props.drainBoundsTable,
            drainBoundsColumns: props.drainBoundsColumns,
            replayCompletionsTable: props.replayCompletionsTable,
          });
        }
        yield* promote({
          ...props,
          selectionId,
          candidate,
          origin: linked ? origin : null,
          expectedCheckpoint: 'final-replay-complete',
        });
        yield* props.drainSystemWrites({
          generationId: candidate.generationId,
          throughWriteIndex: null,
          includeHeld: true,
        });
        if (candidate.clean) {
          const retiredBranches = (yield* readCleanBranches({
            db: props.db,
            deployId: candidate.id,
            targetGenerationId: candidate.generationId,
            generationStateTable: props.generationStateTable,
          })).filter(
            branch =>
              branch.phase === 'retired' &&
              branch.retirementCompletedAt === null,
          );
          const descendantFirst = yield* orderCleanBranchesDescendantFirst({
            deployId: candidate.id,
            branches: retiredBranches,
          });
          for (const branch of descendantFirst) {
            if (branch.activeDeployId === null) {
              return yield* new ZerospinError({
                code: 'system-clean-retire-branch-invalid',
                message:
                  'A clean takeover found a retired branch without an active deploy',
                extra: {
                  deployId: candidate.id,
                  generationId: branch.generationId,
                },
              });
            }
            yield* retireGeneration({
              db: props.db,
              activationGuard: Effect.void,
              deployId: branch.activeDeployId,
              generationId: branch.generationId,
              generationStateTable: props.generationStateTable,
              generationStateColumns: props.generationStateColumns,
              repoTable: props.repoTable,
            });
          }
        } else if (
          origin !== null &&
          origin.generationId !== candidate.generationId
        ) {
          yield* retireGeneration({
            db: props.db,
            activationGuard: Effect.void,
            deployId: origin.id,
            generationId: origin.generationId,
            generationStateTable: props.generationStateTable,
            generationStateColumns: props.generationStateColumns,
            repoTable: props.repoTable,
          });
        }
        return;
      }
    }).pipe(
      Effect.catchAll(error => {
        const durableSelection = props.db
          .select()
          .from(props.selectionTable)
          .where(eq(props.selectionColumns.id, selectionId))
          .get();
        const durableCandidate = props.db
          .select()
          .from(props.deployTable)
          .where(eq(props.deployColumns.id, props.deployId))
          .get();
        const durableOrigin =
          durableCandidate?.prevDeployId === null ||
          durableCandidate?.prevDeployId === undefined
            ? null
            : props.db
                .select()
                .from(props.deployTable)
                .where(
                  eq(props.deployColumns.id, durableCandidate.prevDeployId),
                )
                .get();
        const durableOriginState =
          durableOrigin === null || durableOrigin === undefined
            ? null
            : props.db
                .select()
                .from(props.generationStateTable)
                .where(
                  eq(
                    props.generationStateColumns.generationId,
                    durableOrigin.generationId,
                  ),
                )
                .get();
        const postCut =
          lastCheckpoint === 'ownership-cut' ||
          lastCheckpoint === 'source-writes-terminal' ||
          lastCheckpoint === 'fixed-point-drained' ||
          lastCheckpoint === 'final-replay-complete' ||
          (durableCandidate !== undefined &&
            durableSelection?.writeGenerationId ===
              durableCandidate.generationId) ||
          durableOriginState?.phase === 'draining';
        if (postCut) {
          return Effect.fail(error);
        }
        return Schema.encode(Schema.parseJson(ZerospinError.schema))(
          error,
        ).pipe(
          Effect.flatMap(failure =>
            Effect.try({
              try: () =>
                props.db.transaction(tx => {
                  tx.update(props.deployTable)
                    .set({ status: 'failed', failure, completedAt: new Date() })
                    .where(eq(props.deployColumns.id, props.deployId))
                    .run();
                  tx.update(props.selectionTable)
                    .set({ activatingDeployId: null })
                    .where(eq(props.selectionColumns.id, selectionId))
                    .run();
                }),
              catch: () => error,
            }),
          ),
          Effect.flatMap(() => error),
        );
      }),
    );
  },
);

const readCleanBranches = Effect.fn(
  'SystemRepo.activateDeploy.readCleanBranches',
)(function* (props: {
  db: IDb;
  deployId: string;
  targetGenerationId: string;
  generationStateTable: IAnyDrizzleSchema;
}) {
  const rawBranches = yield* Effect.try({
    try: () => props.db.select().from(props.generationStateTable).all(),
    catch: ZerospinError.catch({
      code: 'system-clean-branch-scan-failed',
      message: 'Failed to scan displaced generation branches',
      extra: { deployId: props.deployId },
    }),
  });
  const branches = yield* Schema.decodeUnknown(
    Schema.Array(
      Schema.Struct({
        generationId: Schema.String,
        prevGenerationId: Schema.NullOr(Schema.String),
        activeDeployId: Schema.NullOr(Schema.String),
        phase: Schema.Literal(
          'closed',
          'migrating',
          'open',
          'draining',
          'retired',
        ),
        lastWriteIndex: Schema.Number,
        drainFrozenAt: Schema.NullOr(Schema.DateFromSelf),
        retirementCompletedAt: Schema.NullOr(Schema.DateFromSelf),
      }),
    ),
  )(rawBranches).pipe(
    mapParseError({
      code: 'system-clean-branch-scan-invalid',
      prefix: 'Stored displaced generation branches are invalid',
      extra: { deployId: props.deployId },
    }),
  );
  return branches.filter(
    branch => branch.generationId !== props.targetGenerationId,
  );
});

const orderCleanBranchesDescendantFirst = Effect.fn(
  'SystemRepo.activateDeploy.orderCleanBranchesDescendantFirst',
)(function* (props: { deployId: string; branches: ReadonlyArray<unknown> }) {
  const pending = [
    ...(yield* Schema.decodeUnknown(
      Schema.Array(
        Schema.Struct({
          generationId: Schema.String,
          prevGenerationId: Schema.NullOr(Schema.String),
          activeDeployId: Schema.NullOr(Schema.String),
          phase: Schema.Literal(
            'closed',
            'migrating',
            'open',
            'draining',
            'retired',
          ),
          lastWriteIndex: Schema.Number,
          drainFrozenAt: Schema.NullOr(Schema.DateFromSelf),
          retirementCompletedAt: Schema.NullOr(Schema.DateFromSelf),
        }),
      ),
    )(props.branches).pipe(
      mapParseError({
        code: 'system-clean-retire-lineage-invalid',
        prefix: 'Stored clean-retirement lineage is invalid',
        extra: { deployId: props.deployId },
      }),
    )),
  ];
  const descendantFirst: (typeof pending)[number][] = [];
  while (pending.length > 0) {
    const descendantIndex = pending.findIndex(
      branch =>
        !pending.some(other => other.prevGenerationId === branch.generationId),
    );
    if (descendantIndex === -1) {
      return yield* new ZerospinError({
        code: 'system-clean-retire-lineage-invalid',
        message:
          'Clean retirement could not select a descendant generation branch',
        extra: { deployId: props.deployId },
      });
    }
    const [descendant] = pending.splice(descendantIndex, 1);
    if (descendant !== undefined) {
      descendantFirst.push(descendant);
    }
  }
  return descendantFirst;
});

const setCheckpoint = Effect.fn('SystemRepo.activateDeploy.setCheckpoint')(
  function* (props: {
    db: IDb;
    selectionId: string;
    deployId: string;
    from: Schema.Schema.Type<typeof ActivationCheckpoint>;
    to: Schema.Schema.Type<typeof ActivationCheckpoint>;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      activatingDeployId: AnyColumn;
    }>;
    deployTable: IAnyDrizzleSchema;
    deployColumns: Readonly<{
      id: AnyColumn;
      status: AnyColumn;
      activationCheckpoint: AnyColumn;
    }>;
  }) {
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          const selection = tx
            .select()
            .from(props.selectionTable)
            .where(eq(props.selectionColumns.id, props.selectionId))
            .get();
          if (selection?.activatingDeployId !== props.deployId) {
            return;
          }
          tx.update(props.deployTable)
            .set({ activationCheckpoint: props.to })
            .where(
              and(
                eq(props.deployColumns.id, props.deployId),
                eq(props.deployColumns.status, 'activating'),
                eq(props.deployColumns.activationCheckpoint, props.from),
              ),
            )
            .run();
        }),
      catch: ZerospinError.catch({
        code: 'system-activation-checkpoint-write-failed',
        message: 'Failed to persist activation checkpoint',
        extra: { deployId: props.deployId, from: props.from, to: props.to },
      }),
    });
  },
);

const ownershipCut = Effect.fn('SystemRepo.activateDeploy.ownershipCut')(
  function* (props: {
    db: IDb;
    selectionId: string;
    candidateDeployId: string;
    originDeployId: string;
    originGenerationId: string;
    targetGenerationId: string;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      activatingDeployId: AnyColumn;
      writeGenerationId: AnyColumn;
    }>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      drainFrozenAt: AnyColumn;
      generationId: AnyColumn;
      phase: AnyColumn;
      successorGenerationId: AnyColumn;
    }>;
  }) {
    yield* Effect.try({
      try: () =>
        props.db.transaction(tx => {
          const selection = tx
            .select()
            .from(props.selectionTable)
            .where(eq(props.selectionColumns.id, props.selectionId))
            .get();
          const source = tx
            .select()
            .from(props.generationStateTable)
            .where(
              eq(
                props.generationStateColumns.generationId,
                props.originGenerationId,
              ),
            )
            .get();
          const target = tx
            .select()
            .from(props.generationStateTable)
            .where(
              eq(
                props.generationStateColumns.generationId,
                props.targetGenerationId,
              ),
            )
            .get();
          if (
            selection?.activatingDeployId !== props.candidateDeployId ||
            selection.writeGenerationId !== props.originGenerationId ||
            source?.phase !== 'open' ||
            source.activeDeployId !== props.originDeployId ||
            target?.phase !== 'migrating' ||
            target.readyAt === null
          ) {
            throw new ZerospinError({
              code: 'generation-ownership-cut-conflict',
              message: 'Generation state changed before the ownership cut',
              extra: {
                originGenerationId: props.originGenerationId,
                targetGenerationId: props.targetGenerationId,
              },
            });
          }
          tx.update(props.generationStateTable)
            .set({
              phase: 'draining',
              drainFrozenAt: null,
              successorGenerationId: props.targetGenerationId,
            })
            .where(
              eq(
                props.generationStateColumns.generationId,
                props.originGenerationId,
              ),
            )
            .run();
          tx.update(props.selectionTable)
            .set({ writeGenerationId: props.targetGenerationId })
            .where(eq(props.selectionColumns.id, props.selectionId))
            .run();
        }),
      catch: ZerospinError.catch({
        code: 'generation-ownership-cut-write-failed',
        message: 'Failed to commit the generation ownership cut',
      }),
    });
  },
);

const cleanOwnershipCut = Effect.fn(
  'SystemRepo.activateDeploy.cleanOwnershipCut',
)(function* (props: {
  db: IDb;
  selectionId: string;
  candidateDeployId: string;
  originDeployId: string;
  originGenerationId: string;
  selectionTable: IAnyDrizzleSchema;
  selectionColumns: Readonly<{
    id: AnyColumn;
    activatingDeployId: AnyColumn;
    writeGenerationId: AnyColumn;
  }>;
  generationStateTable: IAnyDrizzleSchema;
  generationStateColumns: Readonly<{
    activeDeployId: AnyColumn;
    drainFrozenAt: AnyColumn;
    generationId: AnyColumn;
    phase: AnyColumn;
  }>;
}) {
  yield* Effect.try({
    try: () =>
      props.db.transaction(tx => {
        const selection = tx
          .select()
          .from(props.selectionTable)
          .where(eq(props.selectionColumns.id, props.selectionId))
          .get();
        const source = tx
          .select()
          .from(props.generationStateTable)
          .where(
            eq(
              props.generationStateColumns.generationId,
              props.originGenerationId,
            ),
          )
          .get();
        if (
          selection?.activatingDeployId !== props.candidateDeployId ||
          selection.writeGenerationId !== props.originGenerationId ||
          source?.activeDeployId !== props.originDeployId ||
          (source.phase !== 'open' && source.phase !== 'draining')
        ) {
          throw new ZerospinError({
            code: 'generation-clean-ownership-cut-conflict',
            message: 'Generation state changed before the clean ownership cut',
            extra: { originGenerationId: props.originGenerationId },
          });
        }
        const branches = tx.select().from(props.generationStateTable).all();
        for (const branch of branches) {
          if (branch.phase !== 'open') {
            continue;
          }
          if (branch.activeDeployId === null) {
            throw new ZerospinError({
              code: 'generation-clean-ownership-cut-conflict',
              message:
                'A displaced open generation has no active deploy at the clean ownership cut',
              extra: {
                originGenerationId: props.originGenerationId,
                generationId: branch.generationId,
              },
            });
          }
          tx.update(props.generationStateTable)
            .set({ phase: 'draining', drainFrozenAt: null })
            .where(
              and(
                eq(
                  props.generationStateColumns.generationId,
                  branch.generationId,
                ),
                eq(props.generationStateColumns.phase, 'open'),
              ),
            )
            .run();
        }
      }),
    catch: ZerospinError.catch({
      code: 'generation-clean-ownership-cut-write-failed',
      message: 'Failed to commit the clean generation ownership cut',
    }),
  });
});

const assertFinalReplayProof = Effect.fn(
  'SystemRepo.activateDeploy.assertFinalReplayProof',
)(function* (props: {
  db: IDb;
  sourceGenerationId: string;
  targetGenerationId: string;
  drainBoundsTable: IAnyDrizzleSchema;
  drainBoundsColumns: Readonly<{
    generationId: AnyColumn;
    repoType: AnyColumn;
    sourceRepoName: AnyColumn;
    targetRepoName: AnyColumn;
  }>;
  replayCompletionsTable: IAnyDrizzleSchema;
}): Effect.fn.Return<void, IAnyError, Async> {
  const sourceBounds = props.db
    .select()
    .from(props.drainBoundsTable)
    .where(eq(props.drainBoundsColumns.generationId, props.sourceGenerationId))
    .all();
  const completions = props.db
    .select()
    .from(props.replayCompletionsTable)
    .all()
    .filter(row => row.generationId === props.targetGenerationId);

  for (const bound of sourceBounds) {
    if (
      bound.repoType === 'ServiceBlockRepo' ||
      bound.repoType === 'AggregateBlockRepo'
    ) {
      const completion = completions.find(
        row => row.prevRepoName === bound.sourceRepoName,
      );
      if (
        completion === undefined ||
        completion.terminalCursor !== bound.terminalCursor ||
        completion.terminalIndex !== bound.terminalIndex
      ) {
        return yield* new ZerospinError({
          code: 'generation-final-replay-proof-mismatch',
          message:
            'Target replay completion does not equal the final source ledger bound',
          extra: {
            sourceRepoName: bound.sourceRepoName,
            targetGenerationId: props.targetGenerationId,
          },
        });
      }
    }

    if (bound.repoType === 'ServiceBlockRepo') {
      const sourceKey =
        yield* ServiceBlockRepo.boundDORepoConfig.nameUtils.parseName(
          bound.sourceRepoName,
        );
      const targetRepo = yield* getServiceBlockRepo({
        key: {
          generationId: props.targetGenerationId,
          serviceName: sourceKey.serviceName,
        },
      });
      const targetBound = yield* makeAsync(() =>
        targetRepo.getReplayBound(),
      ).pipe(Effect.flatMap(decodeRpc));
      if (
        targetBound.lastServiceCursor !== bound.terminalCursor ||
        targetBound.serviceIndex !== bound.terminalIndex
      ) {
        return yield* new ZerospinError({
          code: 'generation-final-service-ledger-mismatch',
          message:
            'Target service ledger does not equal the final source bound',
          extra: { sourceRepoName: bound.sourceRepoName },
        });
      }
      continue;
    }

    if (bound.repoType === 'AggregateBlockRepo') {
      const sourceKey =
        yield* AggregateBlockRepo.boundDORepoConfig.nameUtils.parseName(
          bound.sourceRepoName,
        );
      const targetRepo = yield* getAggregateBlockRepo({
        key: {
          generationId: props.targetGenerationId,
          aggregateId: sourceKey.aggregateId,
          aggregateName: sourceKey.aggregateName,
        },
      });
      const targetBound = yield* makeAsync(() =>
        targetRepo.getReplayBound(),
      ).pipe(Effect.flatMap(decodeRpc));
      if (
        targetBound.lastAggregateCursor !== bound.terminalCursor ||
        targetBound.aggregateIndex !== bound.terminalIndex
      ) {
        return yield* new ZerospinError({
          code: 'generation-final-aggregate-ledger-mismatch',
          message:
            'Target aggregate ledger does not equal the final source bound',
          extra: { sourceRepoName: bound.sourceRepoName },
        });
      }
      continue;
    }

    if (bound.repoType === 'ServiceBlockSubscriber') {
      if (bound.targetRepoName === null) {
        return yield* new ZerospinError({
          code: 'generation-final-subscriber-target-missing',
          message: 'Final service subscriber proof is missing its target Repo',
          extra: { sourceRepoName: bound.sourceRepoName },
        });
      }
      const sourceServiceKey =
        yield* ServiceBlockRepo.boundDORepoConfig.nameUtils.parseName(
          bound.sourceRepoName,
        );
      const sourceAggregateKey =
        yield* AggregateRepo.boundDORepoConfig.nameUtils.parseName(
          bound.targetRepoName,
        );
      const targetServiceRepo = yield* getServiceBlockRepo({
        key: {
          generationId: props.targetGenerationId,
          serviceName: sourceServiceKey.serviceName,
        },
      });
      const targetAggregateRepoName =
        yield* AggregateRepo.boundDORepoConfig.nameUtils.makeName({
          generationId: props.targetGenerationId,
          aggregateId: sourceAggregateKey.aggregateId,
          aggregateName: sourceAggregateKey.aggregateName,
        });
      const table = yield* makeAsync<
        Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
      >(() =>
        targetServiceRepo.getRepoTableRows({
          tableName: 'aggregateSubscribers',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const subscriber = table.rows.find(
        row => row.aggregateRepoName === targetAggregateRepoName,
      );
      if (
        subscriber?.currentServiceCursor !== bound.terminalCursor ||
        subscriber?.currentServiceIndex !== bound.terminalIndex
      ) {
        return yield* new ZerospinError({
          code: 'generation-final-subscriber-watermark-mismatch',
          message:
            'Target service subscriber does not equal the final source watermark',
          extra: {
            sourceRepoName: bound.sourceRepoName,
            targetRepoName: bound.targetRepoName,
          },
        });
      }
    }
  }
});

const promote = Effect.fn('SystemRepo.activateDeploy.promote')(
  function* (props: {
    db: IDb;
    selectionId: string;
    candidate: Readonly<{
      id: string;
      prevDeployId: string | null;
      generationId: string;
      clean: boolean;
    }>;
    origin: Readonly<{ id: string; generationId: string }> | null;
    expectedCheckpoint: Schema.Schema.Type<typeof ActivationCheckpoint>;
    cleanRequestId: string | null;
    selectionTable: IAnyDrizzleSchema;
    selectionColumns: Readonly<{
      id: AnyColumn;
      activeDeployId: AnyColumn;
      activatingDeployId: AnyColumn;
      writeGenerationId: AnyColumn;
      lastCleanRequestId: AnyColumn;
    }>;
    deployTable: IAnyDrizzleSchema;
    deployColumns: Readonly<{
      id: AnyColumn;
      status: AnyColumn;
      activationCheckpoint: AnyColumn;
    }>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      generationId: AnyColumn;
      phase: AnyColumn;
      preparingDeployId: AnyColumn;
      successorGenerationId: AnyColumn;
    }>;
  }) {
    yield* makeTx({
      db: props.db,
      program: Effect.fn('SystemRepo.activateDeploy.promote.transaction')(
        function* ({ tx }) {
          const selection = tx
            .select()
            .from(props.selectionTable)
            .where(eq(props.selectionColumns.id, props.selectionId))
            .get();
          const deploy = tx
            .select()
            .from(props.deployTable)
            .where(eq(props.deployColumns.id, props.candidate.id))
            .get();
          if (
            selection?.activatingDeployId !== props.candidate.id ||
            deploy?.status !== 'activating' ||
            deploy.activationCheckpoint !== props.expectedCheckpoint
          ) {
            return;
          }
          if (props.origin !== null) {
            const source = tx
              .select()
              .from(props.generationStateTable)
              .where(
                eq(
                  props.generationStateColumns.generationId,
                  props.origin.generationId,
                ),
              )
              .get();
            if (source?.phase !== 'draining' || source.drainFrozenAt === null) {
              return yield* new ZerospinError({
                code: 'system-deploy-promotion-origin-conflict',
                message:
                  'The source generation lacks its final draining proof at promotion',
                extra: { generationId: props.origin.generationId },
              });
            }
            tx.update(props.generationStateTable)
              .set({ phase: 'retired', retiredAt: new Date() })
              .where(
                eq(
                  props.generationStateColumns.generationId,
                  props.origin.generationId,
                ),
              )
              .run();
          }
          if (props.candidate.clean) {
            const liveBranches = tx
              .select()
              .from(props.generationStateTable)
              .all()
              .filter(
                branch =>
                  branch.generationId !== props.candidate.generationId &&
                  (branch.phase === 'open' || branch.phase === 'draining'),
              );
            const descendantFirst = yield* orderCleanBranchesDescendantFirst({
              deployId: props.candidate.id,
              branches: liveBranches,
            });
            const retiredAt = new Date();
            for (const branch of descendantFirst) {
              if (
                branch.phase !== 'draining' ||
                branch.drainFrozenAt === null ||
                branch.activeDeployId === null
              ) {
                return yield* new ZerospinError({
                  code: 'system-clean-promotion-origin-conflict',
                  message:
                    'A clean deploy found a displaced branch without a fixed-point proof',
                  extra: {
                    deployId: props.candidate.id,
                    generationId: branch.generationId,
                    phase: branch.phase,
                    activeDeployId: branch.activeDeployId,
                  },
                });
              }
              tx.update(props.generationStateTable)
                .set({
                  phase: 'retired',
                  successorGenerationId: null,
                  retiredAt,
                })
                .where(
                  and(
                    eq(
                      props.generationStateColumns.generationId,
                      branch.generationId,
                    ),
                    eq(props.generationStateColumns.phase, 'draining'),
                  ),
                )
                .run();
            }
            const remainingWritableBranch = tx
              .select()
              .from(props.generationStateTable)
              .all()
              .find(
                branch =>
                  branch.generationId !== props.candidate.generationId &&
                  (branch.phase === 'open' || branch.phase === 'draining'),
              );
            if (remainingWritableBranch !== undefined) {
              return yield* new ZerospinError({
                code: 'system-clean-promotion-live-branch-conflict',
                message:
                  'A clean deploy cannot promote beside an open or draining generation',
                extra: {
                  deployId: props.candidate.id,
                  generationId: remainingWritableBranch.generationId,
                  phase: remainingWritableBranch.phase,
                },
              });
            }
          }
          const target = tx
            .select()
            .from(props.generationStateTable)
            .where(
              eq(
                props.generationStateColumns.generationId,
                props.candidate.generationId,
              ),
            )
            .get();
          if (
            target?.readyAt === null ||
            target === undefined ||
            (target.phase !== 'closed' &&
              target.phase !== 'migrating' &&
              target.phase !== 'open')
          ) {
            return yield* new ZerospinError({
              code: 'system-deploy-promotion-target-conflict',
              message: 'The destination generation is not ready for promotion',
              extra: { generationId: props.candidate.generationId },
            });
          }
          yield* openGeneration({
            db: tx,
            deployId: props.candidate.id,
            generationId: props.candidate.generationId,
            generationStateTable: props.generationStateTable,
            generationStateColumns: props.generationStateColumns,
          });
          tx.update(props.deployTable)
            .set({
              status: 'succeeded',
              failure: null,
              completedAt: new Date(),
            })
            .where(eq(props.deployColumns.id, props.candidate.id))
            .run();
          tx.update(props.selectionTable)
            .set({
              activeDeployId: props.candidate.id,
              activatingDeployId: null,
              writeGenerationId: props.candidate.generationId,
              lastCleanRequestId:
                props.candidate.clean && props.cleanRequestId !== null
                  ? props.cleanRequestId
                  : selection.lastCleanRequestId,
            })
            .where(eq(props.selectionColumns.id, props.selectionId))
            .run();
        },
      ),
    });
  },
);
