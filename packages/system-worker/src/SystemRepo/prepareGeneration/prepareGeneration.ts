/*
 * System-worker annotation:
 * Prepares one candidate generation in a single blocking Effect. Reuse only
 * updates candidate admission metadata; clean seeds and historical replay build
 * a new immutable lineage before readiness becomes authoritative.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
} from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { AccountBlockRepo } from '../../AccountBlockRepo/AccountBlockRepo.js';
import { getAccountBlockRepo } from '../../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import {
  AccountRepo as AccountRepoClass,
  type AccountRepo,
} from '../../AccountRepo/AccountRepo.js';
import { getAccountRepo } from '../../AccountRepo/getAccountRepo/getAccountRepo.js';
import { ServiceBlockRepo } from '../../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';
import { SystemRepo } from '../SystemRepo.js';

export const prepareGeneration = Effect.fn('SystemRepo.prepareGeneration')(
  function* (props: {
    db: IDb;
    deployId: string;
    generationId: string;
    prevGenerationId: string | null;
    systemSpec: ISystemSpec;
    seeds: readonly IDeploySeedCommand[];
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
      initialDeployId: AnyColumn;
      preparingDeployId: AnyColumn;
      readiness: AnyColumn;
    }>;
    replayCompletionsTable: IAnyDrizzleSchema;
    replayCompletionsColumns: Readonly<{
      deployId: AnyColumn;
      targetRepoName: AnyColumn;
    }>;
    repoTable: IAnyDrizzleSchema;
  }): Effect.fn.Return<
    Readonly<{
      deployId: string;
      generationId: string;
      readiness: 'ready';
      reusedGeneration: boolean;
    }>,
    IAnyError,
    Async
  > {
    const {
      db,
      deployId,
      generationId,
      generationStateColumns,
      generationStateTable,
      prevGenerationId,
      replayCompletionsColumns,
      replayCompletionsTable,
      repoTable,
      seeds,
      systemSpec,
    } = props;

    if (prevGenerationId === generationId) {
      return yield* new ZerospinError({
        code: 'generation-cannot-replay-itself',
        message: 'A new generation cannot name itself as its predecessor',
        extra: { deployId, generationId, prevGenerationId },
      });
    }

    // Checkpoint 1: the candidate spec must describe the code executing this
    // preparation. A caller-supplied different spec cannot authorize readiness.
    const encodedSystemSpec = yield* Schema.encode(
      Schema.parseJson(SystemSpecSchema),
    )(systemSpec).pipe(
      mapParseError({
        code: 'generation-system-spec-encode-failed',
        prefix: 'Failed to encode candidate SystemSpec',
        extra: { deployId, generationId },
      }),
    );
    const encodedRuntimeSystemSpec = yield* Schema.encode(
      Schema.parseJson(SystemSpecSchema),
    )(makeSystemSpec({ system })).pipe(
      mapParseError({
        code: 'generation-runtime-system-spec-encode-failed',
        prefix: 'Failed to encode runtime SystemSpec',
        extra: { deployId, generationId },
      }),
    );
    if (encodedSystemSpec !== encodedRuntimeSystemSpec) {
      return yield* new ZerospinError({
        code: 'generation-system-spec-runtime-mismatch',
        message: 'The candidate SystemSpec does not match this Worker code',
        extra: { deployId, generationId },
      });
    }

    const rawStoredGeneration = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-prepare-state-read-failed',
        message: 'Failed to read generation preparation state',
        extra: { deployId, generationId },
      }),
    });

    if (rawStoredGeneration !== undefined) {
      const storedGeneration = yield* Schema.decodeUnknown(
        Schema.Struct({
          generationId: Schema.String,
          prevGenerationId: Schema.NullOr(Schema.String),
          initialDeployId: Schema.String,
          activeDeployId: Schema.NullOr(Schema.String),
          preparingDeployId: Schema.NullOr(Schema.String),
          readiness: Schema.Literal('initializing', 'ready', 'failed'),
          admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
          activeSystemSpec: Schema.NullOr(Schema.String),
          preparingSystemSpec: Schema.NullOr(Schema.String),
        }),
      )(rawStoredGeneration).pipe(
        mapParseError({
          code: 'generation-prepare-state-invalid',
          prefix: 'Stored generation preparation state is invalid',
          extra: { deployId, generationId },
        }),
      );

      if (storedGeneration.readiness === 'failed') {
        return yield* new ZerospinError({
          code: 'failed-generation-cannot-resume',
          message: 'A failed target generation can never be prepared again',
          extra: { deployId, generationId },
        });
      }

      // Checkpoint 2: same-deploy retries after readiness or opening return the
      // original result only when the persisted candidate spec is identical.
      if (
        storedGeneration.initialDeployId === deployId &&
        storedGeneration.readiness === 'ready' &&
        (storedGeneration.preparingDeployId === deployId ||
          storedGeneration.activeDeployId === deployId)
      ) {
        const storedSystemSpec =
          storedGeneration.preparingDeployId === deployId
            ? storedGeneration.preparingSystemSpec
            : storedGeneration.activeSystemSpec;
        if (storedSystemSpec !== encodedSystemSpec) {
          return yield* new ZerospinError({
            code: 'generation-prepare-retry-system-spec-mismatch',
            message:
              'The deploy already prepared this generation with another SystemSpec',
            extra: { deployId, generationId },
          });
        }
        return {
          deployId,
          generationId,
          readiness: 'ready',
          reusedGeneration: false,
        };
      }

      if (
        storedGeneration.readiness === 'initializing' &&
        (storedGeneration.initialDeployId !== deployId ||
          storedGeneration.preparingDeployId !== deployId ||
          storedGeneration.preparingSystemSpec !== encodedSystemSpec)
      ) {
        return yield* new ZerospinError({
          code: 'generation-preparation-owned-by-another-deploy',
          message: 'Another deploy already owns this generation preparation',
          extra: {
            deployId,
            generationId,
            initialDeployId: storedGeneration.initialDeployId,
            preparingDeployId: storedGeneration.preparingDeployId,
          },
        });
      }

      if (storedGeneration.readiness === 'ready') {
        if (
          storedGeneration.preparingDeployId !== null &&
          storedGeneration.preparingDeployId !== deployId
        ) {
          return yield* new ZerospinError({
            code: 'generation-reuse-owned-by-another-deploy',
            message: 'Another deploy already owns generation reuse preparation',
            extra: {
              deployId,
              generationId,
              preparingDeployId: storedGeneration.preparingDeployId,
            },
          });
        }
        if (storedGeneration.activeSystemSpec === null) {
          return yield* new ZerospinError({
            code: 'generation-reuse-active-system-spec-missing',
            message: 'A reusable generation must have an active SystemSpec',
            extra: { deployId, generationId },
          });
        }
        if (prevGenerationId !== null) {
          return yield* new ZerospinError({
            code: 'generation-reuse-predecessor-must-be-null',
            message: 'Reusing a generation does not replay a predecessor',
            extra: { deployId, generationId, prevGenerationId },
          });
        }
        if (seeds.length !== 0) {
          return yield* new ZerospinError({
            code: 'generation-reuse-seeds-not-allowed',
            message: 'Seeds run only for a detached clean generation',
            extra: { deployId, generationId, seedCount: seeds.length },
          });
        }

        const activeSystemSpec = yield* Schema.decodeUnknown(
          Schema.parseJson(SystemSpecSchema),
        )(storedGeneration.activeSystemSpec).pipe(
          mapParseError({
            code: 'generation-reuse-active-system-spec-invalid',
            prefix: 'Stored active SystemSpec is invalid',
            extra: { deployId, generationId },
          }),
        );
        const compatibility = yield* checkSystemCompatibility({
          prior: activeSystemSpec,
          next: systemSpec,
        });
        if (compatibility.requiresNewGeneration) {
          return yield* new ZerospinError({
            code: 'generation-reuse-model-definitions-changed',
            message:
              'The candidate changes encoded model definitions and requires a new generation',
            extra: {
              deployId,
              generationId,
              requiredBump: compatibility.requiredBump,
              diffCount: compatibility.diffs.length,
              missingAdapterCount: compatibility.missingAdapters.length,
            },
          });
        }
        if (compatibility.missingAdapters.length !== 0) {
          return yield* new ZerospinError({
            code: 'generation-reuse-mutation-adapters-missing',
            message: 'The candidate has unresolved mutation adapter requirements',
            extra: {
              deployId,
              generationId,
              missingAdapterCount: compatibility.missingAdapters.length,
            },
          });
        }

        yield* Effect.try({
          try: () =>
            db
              .update(generationStateTable)
              .set({
                preparingDeployId: deployId,
                preparingSystemSpec: encodedSystemSpec,
                failure: null,
              })
              .where(
                and(
                  eq(generationStateColumns.generationId, generationId),
                  eq(generationStateColumns.readiness, 'ready'),
                ),
              )
              .run(),
          catch: ZerospinError.catch({
            code: 'generation-reuse-prepare-write-failed',
            message: 'Failed to persist generation reuse preparation',
            extra: { deployId, generationId },
          }),
        });

        return {
          deployId,
          generationId,
          readiness: 'ready',
          reusedGeneration: true,
        };
      }
    } else {
      // Checkpoint 3: first preparation creates the only lifecycle row for this
      // target lineage. A clean/initial root has no predecessor.
      yield* Effect.try({
        try: () =>
          db
            .insert(generationStateTable)
            .values({
              generationId,
              prevGenerationId,
              initialDeployId: deployId,
              activeDeployId: null,
              preparingDeployId: deployId,
              readiness: 'initializing',
              admission: 'closed',
              activeSystemSpec: null,
              preparingSystemSpec: encodedSystemSpec,
              failure: null,
              createdAt: new Date(),
              readyAt: null,
              openedAt: null,
              drainedAt: null,
            })
            .run(),
        catch: ZerospinError.catch({
          code: 'generation-prepare-state-create-failed',
          message: 'Failed to create target generation preparation state',
          extra: { deployId, generationId, prevGenerationId },
        }),
      });
    }

    // Checkpoint 4: everything below belongs only to the new target generation.
    // Any failure makes this lineage permanently inactive.
    return yield* Effect.gen(function* () {
      if (prevGenerationId === null) {
        // Clean seeds preserve their declared order and use ordinary finalization
        // so the root generation starts with normal authoritative ledgers.
        for (const seed of seeds) {
          if (seed.commandType === 'account') {
            const targetAccountRepo = yield* getAccountRepo({
              key: {
                generationId,
                accountId: seed.accountId,
                accountName: seed.accountName,
              },
            });
            const tracedTargetAccountRepo = makeTraceableRpcTarget<
              Pick<AccountRepo, 'finalizeAccountBlock'>
            >(targetAccountRepo);
            const finalized = yield* tracedTargetAccountRepo
              .finalizeAccountBlock({
                accountId: seed.accountId,
                accountName: seed.accountName,
                commands: [seed],
              })
              .pipe(
                Effect.mapError(errorJson =>
                  errorJson instanceof Error
                    ? new ZerospinError({
                        code: 'generation-seed-account-rpc-failed',
                        message: errorJson.message,
                        cause: ZerospinError.prettyUnknownFailure(errorJson),
                      })
                    : Schema.decodeUnknownSync(ZerospinError.schema)(errorJson),
                ),
              );
            if (
              finalized.failure !== null ||
              finalized.failedCommands.length !== 0
            ) {
              return yield* new ZerospinError({
                code: 'generation-seed-account-finalization-failed',
                message: 'An account seed command failed during clean preparation',
                extra: {
                  deployId,
                  generationId,
                  commandId: seed.id,
                  failedCommandCount: finalized.failedCommands.length,
                },
              });
            }
            continue;
          }

          if (seed.commandType === 'service') {
            const targetServiceRepo = yield* getServiceRepo({
              key: {
                generationId,
                serviceName: seed.serviceName,
              },
            });
            const encodedFinalized = yield* makeAsync(() =>
              targetServiceRepo.finalizeServiceCommands({
                serviceName: seed.serviceName,
                commands: [seed],
              }),
            );
            const finalized = yield* decodeRpc(encodedFinalized);
            if (finalized.failedCommands.length !== 0) {
              return yield* new ZerospinError({
                code: 'generation-seed-service-finalization-failed',
                message: 'A service seed command failed during clean preparation',
                extra: {
                  deployId,
                  generationId,
                  commandId: seed.id,
                  failedCommandCount: finalized.failedCommands.length,
                },
              });
            }
            const encodedDrained = yield* makeAsync(() =>
              targetServiceRepo.drainServiceBlockOutbox(),
            );
            yield* decodeRpc(encodedDrained);
            continue;
          }

          return yield* new ZerospinError({
            code: 'generation-seed-command-type-unsupported',
            message: 'Generation seeds contain an unsupported command type',
            extra: { deployId, generationId },
          });
        }
      } else {
        if (seeds.length !== 0) {
          return yield* new ZerospinError({
            code: 'generation-migration-seeds-not-allowed',
            message: 'Migration preparation cannot run clean seeds',
            extra: { deployId, generationId, seedCount: seeds.length },
          });
        }

        const sourceSystemRepo = SystemRepo.getRepo({
          generationId: prevGenerationId,
        });
        const encodedSourceState = yield* makeAsync(() =>
          sourceSystemRepo.getGenerationState(),
        );
        const sourceState = yield* decodeRpc(encodedSourceState);
        if (sourceState === null) {
          return yield* new ZerospinError({
            code: 'generation-source-state-missing',
            message: 'The predecessor generation has no lifecycle state',
            extra: { deployId, generationId, prevGenerationId },
          });
        }
        if (
          sourceState.readiness !== 'ready' ||
          sourceState.admission !== 'drained' ||
          sourceState.activeSystemSpec === null
        ) {
          return yield* new ZerospinError({
            code: 'generation-source-not-drained',
            message:
              'The predecessor must be ready and drained with an active SystemSpec',
            extra: {
              deployId,
              generationId,
              prevGenerationId,
              sourceReadiness: sourceState.readiness,
              sourceAdmission: sourceState.admission,
            },
          });
        }

        const compatibility = yield* checkSystemCompatibility({
          prior: sourceState.activeSystemSpec,
          next: systemSpec,
        });
        if (!compatibility.requiresNewGeneration) {
          return yield* new ZerospinError({
            code: 'generation-migration-not-required',
            message:
              'The candidate has identical encoded model definitions and must reuse the active generation',
            extra: {
              deployId,
              generationId,
              prevGenerationId,
              requiredBump: compatibility.requiredBump,
            },
          });
        }
        if (compatibility.missingAdapters.length !== 0) {
          return yield* new ZerospinError({
            code: 'generation-migration-adapters-missing',
            message: 'Generation migration is missing mutation adapter coverage',
            extra: {
              deployId,
              generationId,
              prevGenerationId,
              missingAdapterCount: compatibility.missingAdapters.length,
            },
          });
        }

        const encodedSourceServiceRepos = yield* makeAsync(() =>
          sourceSystemRepo.getRepoRegistrations({ repoType: 'ServiceRepo' }),
        );
        const sourceServiceRepos = yield* decodeRpc(encodedSourceServiceRepos);

        // Checkpoint 5: services replay first, one source repo and one ascending
        // authoritative block at a time.
        for (const sourceServiceRegistration of sourceServiceRepos) {
          const sourceServiceKey =
            yield* ServiceRepo.repoUtils.nameUtils.parseName(
              sourceServiceRegistration.repoName,
            );
          const sourceServiceBlockRepoName =
            yield* ServiceBlockRepo.repoUtils.nameUtils.makeName({
              generationId: prevGenerationId,
              serviceName: sourceServiceKey.serviceName,
            });
          let sourceBound:
            | (typeof sourceState.drainBounds)[number]
            | null = null;
          for (const candidateBound of sourceState.drainBounds) {
            if (candidateBound.repoName !== sourceServiceBlockRepoName) {
              continue;
            }
            if (sourceBound !== null) {
              return yield* new ZerospinError({
                code: 'generation-service-replay-bound-duplicate',
                message: 'A source ServiceRepo has duplicate replay bounds',
                extra: {
                  deployId,
                  generationId,
                  sourceRepoName: sourceServiceRegistration.repoName,
                },
              });
            }
            sourceBound = candidateBound;
          }

          const targetServiceRepoName =
            yield* ServiceRepo.repoUtils.nameUtils.makeName({
              generationId,
              serviceName: sourceServiceKey.serviceName,
            });
          const existingCompletion = yield* Effect.try({
            try: () =>
              db
                .select()
                .from(replayCompletionsTable)
                .where(
                  and(
                    eq(replayCompletionsColumns.deployId, deployId),
                    eq(
                      replayCompletionsColumns.targetRepoName,
                      targetServiceRepoName,
                    ),
                  ),
                )
                .get(),
            catch: ZerospinError.catch({
              code: 'generation-service-replay-completion-read-failed',
              message: 'Failed to read the target ServiceRepo replay completion',
              extra: { deployId, generationId, targetServiceRepoName },
            }),
          });
          if (existingCompletion !== undefined) {
            const completion = yield* Schema.decodeUnknown(
              Schema.Struct({
                repoType: Schema.Literal('ServiceRepo', 'AccountRepo'),
                prevRepoName: Schema.String,
                targetRepoName: Schema.String,
                terminalIndex: Schema.NullOr(Schema.Number),
              }),
            )(existingCompletion).pipe(
              mapParseError({
                code: 'generation-service-replay-completion-invalid',
                prefix: 'Stored service replay completion is invalid',
                extra: { deployId, generationId, targetServiceRepoName },
              }),
            );
            if (
              completion.repoType !== 'ServiceRepo' ||
              completion.prevRepoName !== sourceServiceRegistration.repoName ||
              completion.targetRepoName !== targetServiceRepoName ||
              completion.terminalIndex !==
                (sourceBound?.terminalIndex ?? null)
            ) {
              return yield* new ZerospinError({
                code: 'generation-service-replay-completion-mismatch',
                message: 'Stored service replay completion does not match retry',
                extra: { deployId, generationId, targetServiceRepoName },
              });
            }
            continue;
          }

          const targetServiceRepo = yield* getServiceRepo({
            key: {
              generationId,
              serviceName: sourceServiceKey.serviceName,
            },
          });
          let afterServiceIndex: number | null = null;
          let lastServiceCursor: string | null = null;
          let replayedBlockCount = 0;
          if (sourceBound !== null) {
            if (sourceBound.repoType !== 'ServiceBlockRepo') {
              return yield* new ZerospinError({
                code: 'generation-service-replay-bound-type-mismatch',
                message: 'Source service replay bound has the wrong repo type',
                extra: {
                  deployId,
                  generationId,
                  repoName: sourceBound.repoName,
                  repoType: sourceBound.repoType,
                },
              });
            }
            if (sourceBound.terminalIndex === null) {
              if (sourceBound.terminalCursor !== null) {
                return yield* new ZerospinError({
                  code: 'generation-service-empty-bound-inconsistent',
                  message: 'An empty service bound cannot have a terminal cursor',
                  extra: { deployId, generationId, repoName: sourceBound.repoName },
                });
              }
            } else {
              const throughServiceIndex = sourceBound.terminalIndex;
              const sourceServiceBlockRepo = yield* getServiceBlockRepo({
                key: {
                  generationId: prevGenerationId,
                  serviceName: sourceServiceKey.serviceName,
                },
              });
              while (afterServiceIndex !== sourceBound.terminalIndex) {
                const encodedBlock = yield* makeAsync(() =>
                  sourceServiceBlockRepo.getReplayBlock({
                    afterServiceIndex,
                    throughServiceIndex,
                  }),
                );
                const block = yield* decodeRpc(encodedBlock);
                if (block === null) {
                  return yield* new ZerospinError({
                    code: 'generation-service-replay-block-missing',
                    message: 'Source ServiceBlockRepo ended before its bound',
                    extra: {
                      deployId,
                      generationId,
                      repoName: sourceBound.repoName,
                      afterServiceIndex,
                      throughServiceIndex: sourceBound.terminalIndex,
                    },
                  });
                }
                if (
                  (afterServiceIndex !== null &&
                    block.serviceIndex <= afterServiceIndex) ||
                  block.serviceIndex > sourceBound.terminalIndex
                ) {
                  return yield* new ZerospinError({
                    code: 'generation-service-replay-order-invalid',
                    message: 'Source service blocks are not strictly ascending',
                    extra: {
                      deployId,
                      generationId,
                      repoName: sourceBound.repoName,
                      afterServiceIndex,
                      blockServiceIndex: block.serviceIndex,
                      throughServiceIndex: sourceBound.terminalIndex,
                    },
                  });
                }
                const encodedReplayed = yield* makeAsync(() =>
                  targetServiceRepo.replayServiceBlock({
                    deployId,
                    prevGenerationId,
                    block,
                  }),
                );
                const replayed = yield* decodeRpc(encodedReplayed);
                if (
                  replayed.serviceIndex !== block.serviceIndex ||
                  replayed.lastServiceCursor !== block.lastServiceCursor
                ) {
                  return yield* new ZerospinError({
                    code: 'generation-service-replay-result-mismatch',
                    message: 'Target ServiceRepo replayed a different block',
                    extra: {
                      deployId,
                      generationId,
                      targetServiceRepoName,
                      sourceServiceIndex: block.serviceIndex,
                      targetServiceIndex: replayed.serviceIndex,
                    },
                  });
                }
                afterServiceIndex = block.serviceIndex;
                lastServiceCursor = block.lastServiceCursor;
                replayedBlockCount += 1;
              }
              if (lastServiceCursor !== sourceBound.terminalCursor) {
                return yield* new ZerospinError({
                  code: 'generation-service-replay-terminal-cursor-mismatch',
                  message: 'Target service replay did not reach the captured cursor',
                  extra: {
                    deployId,
                    generationId,
                    targetServiceRepoName,
                    expectedCursor: sourceBound.terminalCursor,
                    actualCursor: lastServiceCursor,
                  },
                });
              }
            }

            const targetServiceBlockRepoName =
              yield* ServiceBlockRepo.repoUtils.nameUtils.makeName({
                generationId,
                serviceName: sourceServiceKey.serviceName,
              });
            const targetServiceBlockRepo = yield* getServiceBlockRepo({
              key: {
                generationId,
                serviceName: sourceServiceKey.serviceName,
              },
            });
            const encodedTargetBound = yield* makeAsync(() =>
              targetServiceBlockRepo.getReplayBound(),
            );
            const targetBound = yield* decodeRpc(encodedTargetBound);
            if (
              targetBound.serviceIndex !== sourceBound.terminalIndex ||
              targetBound.lastServiceCursor !== sourceBound.terminalCursor
            ) {
              return yield* new ZerospinError({
                code: 'generation-target-service-bound-mismatch',
                message: 'Target ServiceBlockRepo does not match source bound',
                extra: { deployId, generationId, targetServiceBlockRepoName },
              });
            }
          }

          // Even an empty source data-owner repo must exist in the target
          // generation. The repo-local drain is also the exact no-pending-work
          // postcondition after replay publication.
          const encodedTargetDrained = yield* makeAsync(() =>
            targetServiceRepo.drainGeneration(),
          );
          const targetDrained = yield* decodeRpc(encodedTargetDrained);
          if (targetDrained.pendingServiceBlockCount !== 0) {
            return yield* new ZerospinError({
              code: 'generation-target-service-repo-not-drained',
              message:
                'Target ServiceRepo still has pending work after historical replay',
              extra: {
                deployId,
                generationId,
                targetServiceRepoName,
                pendingServiceBlockCount:
                  targetDrained.pendingServiceBlockCount,
              },
            });
          }

          yield* Effect.try({
            try: () =>
              db
                .insert(replayCompletionsTable)
                .values({
                  deployId,
                  repoType: 'ServiceRepo',
                  prevRepoName: sourceServiceRegistration.repoName,
                  targetRepoName: targetServiceRepoName,
                  terminalIndex: sourceBound?.terminalIndex ?? null,
                  blockCount: replayedBlockCount,
                  completedAt: new Date(),
                })
                .onConflictDoNothing()
                .run(),
            catch: ZerospinError.catch({
              code: 'generation-service-replay-completion-write-failed',
              message: 'Failed to store the target ServiceRepo replay completion',
              extra: { deployId, generationId, targetServiceRepoName },
            }),
          });

          const storedCompletion = yield* Effect.try({
            try: () =>
              db
                .select()
                .from(replayCompletionsTable)
                .where(
                  and(
                    eq(replayCompletionsColumns.deployId, deployId),
                    eq(
                      replayCompletionsColumns.targetRepoName,
                      targetServiceRepoName,
                    ),
                  ),
                )
                .get(),
            catch: ZerospinError.catch({
              code: 'generation-service-replay-completion-verify-read-failed',
              message:
                'Failed to verify the target ServiceRepo replay completion',
              extra: { deployId, generationId, targetServiceRepoName },
            }),
          });
          const verifiedCompletion = yield* Schema.decodeUnknown(
            Schema.Struct({
              repoType: Schema.Literal('ServiceRepo', 'AccountRepo'),
              prevRepoName: Schema.String,
              targetRepoName: Schema.String,
              terminalIndex: Schema.NullOr(Schema.Number),
              blockCount: Schema.Number,
            }),
          )(storedCompletion).pipe(
            mapParseError({
              code: 'generation-service-replay-completion-verify-invalid',
              prefix: 'Stored target ServiceRepo replay completion is invalid',
              extra: { deployId, generationId, targetServiceRepoName },
            }),
          );
          if (
            verifiedCompletion.repoType !== 'ServiceRepo' ||
            verifiedCompletion.prevRepoName !==
              sourceServiceRegistration.repoName ||
            verifiedCompletion.targetRepoName !== targetServiceRepoName ||
            verifiedCompletion.terminalIndex !==
              (sourceBound?.terminalIndex ?? null) ||
            verifiedCompletion.blockCount !== replayedBlockCount
          ) {
            return yield* new ZerospinError({
              code: 'generation-service-replay-completion-write-conflict',
              message:
                'Target ServiceRepo replay completion changed during preparation',
              extra: { deployId, generationId, targetServiceRepoName },
            });
          }
        }

        const encodedSourceAccountRepos = yield* makeAsync(() =>
          sourceSystemRepo.getRepoRegistrations({ repoType: 'AccountRepo' }),
        );
        const sourceAccountRepos = yield* decodeRpc(encodedSourceAccountRepos);

        // Checkpoint 6: accounts replay after every service ledger is complete,
        // then restore service subscriptions at their exact prior watermarks.
        for (const sourceAccountRegistration of sourceAccountRepos) {
          const sourceAccountKey =
            yield* AccountRepoClass.repoUtils.nameUtils.parseName(
              sourceAccountRegistration.repoName,
            );
          const sourceAccountBlockRepoName =
            yield* AccountBlockRepo.repoUtils.nameUtils.makeName({
              generationId: prevGenerationId,
              accountId: sourceAccountKey.accountId,
              accountName: sourceAccountKey.accountName,
            });
          let sourceBound:
            | (typeof sourceState.drainBounds)[number]
            | null = null;
          for (const candidateBound of sourceState.drainBounds) {
            if (candidateBound.repoName !== sourceAccountBlockRepoName) {
              continue;
            }
            if (sourceBound !== null) {
              return yield* new ZerospinError({
                code: 'generation-account-replay-bound-duplicate',
                message: 'A source AccountRepo has duplicate replay bounds',
                extra: {
                  deployId,
                  generationId,
                  sourceRepoName: sourceAccountRegistration.repoName,
                },
              });
            }
            sourceBound = candidateBound;
          }

          const targetAccountRepoName =
            yield* AccountRepoClass.repoUtils.nameUtils.makeName({
              generationId,
              accountId: sourceAccountKey.accountId,
              accountName: sourceAccountKey.accountName,
            });
          const existingCompletion = yield* Effect.try({
            try: () =>
              db
                .select()
                .from(replayCompletionsTable)
                .where(
                  and(
                    eq(replayCompletionsColumns.deployId, deployId),
                    eq(
                      replayCompletionsColumns.targetRepoName,
                      targetAccountRepoName,
                    ),
                  ),
                )
                .get(),
            catch: ZerospinError.catch({
              code: 'generation-account-replay-completion-read-failed',
              message: 'Failed to read the target AccountRepo replay completion',
              extra: { deployId, generationId, targetAccountRepoName },
            }),
          });
          if (existingCompletion !== undefined) {
            const completion = yield* Schema.decodeUnknown(
              Schema.Struct({
                repoType: Schema.Literal('ServiceRepo', 'AccountRepo'),
                prevRepoName: Schema.String,
                targetRepoName: Schema.String,
                terminalIndex: Schema.NullOr(Schema.Number),
              }),
            )(existingCompletion).pipe(
              mapParseError({
                code: 'generation-account-replay-completion-invalid',
                prefix: 'Stored account replay completion is invalid',
                extra: { deployId, generationId, targetAccountRepoName },
              }),
            );
            if (
              completion.repoType !== 'AccountRepo' ||
              completion.prevRepoName !== sourceAccountRegistration.repoName ||
              completion.targetRepoName !== targetAccountRepoName ||
              completion.terminalIndex !==
                (sourceBound?.terminalIndex ?? null)
            ) {
              return yield* new ZerospinError({
                code: 'generation-account-replay-completion-mismatch',
                message: 'Stored account replay completion does not match retry',
                extra: { deployId, generationId, targetAccountRepoName },
              });
            }
            continue;
          }

          const targetAccountRepo = yield* getAccountRepo({
            key: {
              generationId,
              accountId: sourceAccountKey.accountId,
              accountName: sourceAccountKey.accountName,
            },
          });
          let afterAccountIndex: number | null = null;
          let lastAccountCursor: string | null = null;
          let replayedBlockCount = 0;
          if (sourceBound !== null) {
            if (sourceBound.repoType !== 'AccountBlockRepo') {
              return yield* new ZerospinError({
                code: 'generation-account-replay-bound-type-mismatch',
                message: 'Source account replay bound has the wrong repo type',
                extra: {
                  deployId,
                  generationId,
                  repoName: sourceBound.repoName,
                  repoType: sourceBound.repoType,
                },
              });
            }
            if (sourceBound.terminalIndex === null) {
              if (sourceBound.terminalCursor !== null) {
                return yield* new ZerospinError({
                  code: 'generation-account-empty-bound-inconsistent',
                  message: 'An empty account bound cannot have a terminal cursor',
                  extra: { deployId, generationId, repoName: sourceBound.repoName },
                });
              }
            } else {
              const throughAccountIndex = sourceBound.terminalIndex;
              const sourceAccountBlockRepo = yield* getAccountBlockRepo({
                key: {
                  generationId: prevGenerationId,
                  accountId: sourceAccountKey.accountId,
                  accountName: sourceAccountKey.accountName,
                },
              });
              while (afterAccountIndex !== sourceBound.terminalIndex) {
                const encodedBlock = yield* makeAsync(() =>
                  sourceAccountBlockRepo.getReplayBlock({
                    afterAccountIndex,
                    throughAccountIndex,
                  }),
                );
                const block = yield* decodeRpc(encodedBlock);
                if (block === null) {
                  return yield* new ZerospinError({
                    code: 'generation-account-replay-block-missing',
                    message: 'Source AccountBlockRepo ended before its bound',
                    extra: {
                      deployId,
                      generationId,
                      repoName: sourceBound.repoName,
                      afterAccountIndex,
                      throughAccountIndex: sourceBound.terminalIndex,
                    },
                  });
                }
                if (
                  (afterAccountIndex !== null &&
                    block.accountIndex <= afterAccountIndex) ||
                  block.accountIndex > sourceBound.terminalIndex
                ) {
                  return yield* new ZerospinError({
                    code: 'generation-account-replay-order-invalid',
                    message: 'Source account blocks are not strictly ascending',
                    extra: {
                      deployId,
                      generationId,
                      repoName: sourceBound.repoName,
                      afterAccountIndex,
                      blockAccountIndex: block.accountIndex,
                      throughAccountIndex: sourceBound.terminalIndex,
                    },
                  });
                }
                const encodedReplayed = yield* makeAsync(() =>
                  targetAccountRepo.replayAccountBlock({
                    deployId,
                    prevGenerationId,
                    block,
                  }),
                );
                const replayed = yield* decodeRpc(encodedReplayed);
                if (
                  replayed.accountIndex !== block.accountIndex ||
                  replayed.lastAccountCursor !== block.lastAccountCursor
                ) {
                  return yield* new ZerospinError({
                    code: 'generation-account-replay-result-mismatch',
                    message: 'Target AccountRepo replayed a different block',
                    extra: {
                      deployId,
                      generationId,
                      targetAccountRepoName,
                      sourceAccountIndex: block.accountIndex,
                      targetAccountIndex: replayed.accountIndex,
                    },
                  });
                }
                afterAccountIndex = block.accountIndex;
                lastAccountCursor = block.lastAccountCursor;
                replayedBlockCount += 1;
              }
              if (lastAccountCursor !== sourceBound.terminalCursor) {
                return yield* new ZerospinError({
                  code: 'generation-account-replay-terminal-cursor-mismatch',
                  message: 'Target account replay did not reach the captured cursor',
                  extra: {
                    deployId,
                    generationId,
                    targetAccountRepoName,
                    expectedCursor: sourceBound.terminalCursor,
                    actualCursor: lastAccountCursor,
                  },
                });
              }
            }

            const targetAccountBlockRepoName =
              yield* AccountBlockRepo.repoUtils.nameUtils.makeName({
                generationId,
                accountId: sourceAccountKey.accountId,
                accountName: sourceAccountKey.accountName,
              });
            const targetAccountBlockRepo = yield* getAccountBlockRepo({
              key: {
                generationId,
                accountId: sourceAccountKey.accountId,
                accountName: sourceAccountKey.accountName,
              },
            });
            const encodedTargetBound = yield* makeAsync(() =>
              targetAccountBlockRepo.getReplayBound(),
            );
            const targetBound = yield* decodeRpc(encodedTargetBound);
            if (
              targetBound.accountIndex !== sourceBound.terminalIndex ||
              targetBound.lastAccountCursor !== sourceBound.terminalCursor
            ) {
              return yield* new ZerospinError({
                code: 'generation-target-account-bound-mismatch',
                message: 'Target AccountBlockRepo does not match source bound',
                extra: { deployId, generationId, targetAccountBlockRepoName },
              });
            }
          }

          // Empty AccountRepos still belong to the copied data-owner topology.
          // Draining here instantiates the target and proves replay publication
          // is complete before subscriptions become live.
          const encodedTargetDrained = yield* makeAsync(() =>
            targetAccountRepo.drainGeneration(),
          );
          const targetDrained = yield* decodeRpc(encodedTargetDrained);
          if (
            targetDrained.pendingServiceSubscriptionCount !== 0 ||
            targetDrained.pendingAccountBlockCount !== 0
          ) {
            return yield* new ZerospinError({
              code: 'generation-target-account-repo-not-drained',
              message:
                'Target AccountRepo still has pending work after historical replay',
              extra: {
                deployId,
                generationId,
                targetAccountRepoName,
                pendingServiceSubscriptionCount:
                  targetDrained.pendingServiceSubscriptionCount,
                pendingAccountBlockCount:
                  targetDrained.pendingAccountBlockCount,
              },
            });
          }

          const sourceAccountRepo = yield* getAccountRepo({
            key: {
              generationId: prevGenerationId,
              accountId: sourceAccountKey.accountId,
              accountName: sourceAccountKey.accountName,
            },
          });
          const encodedSubscriptions = yield* makeAsync(() =>
            sourceAccountRepo.getReplaySubscriptions(),
          );
          const subscriptions = yield* decodeRpc(encodedSubscriptions);
          for (const subscription of subscriptions) {
            const sourceSubscriptionBlockRepoName =
              yield* ServiceBlockRepo.repoUtils.nameUtils.makeName({
                generationId: prevGenerationId,
                serviceName: subscription.serviceName,
              });
            let subscriptionBound:
              | (typeof sourceState.drainBounds)[number]
              | null = null;
            for (const candidateBound of sourceState.drainBounds) {
              if (candidateBound.repoName === sourceSubscriptionBlockRepoName) {
                subscriptionBound = candidateBound;
                break;
              }
            }
            if (
              subscriptionBound === null ||
              subscriptionBound.repoType !== 'ServiceBlockRepo' ||
              subscriptionBound.terminalIndex === null ||
              subscription.currentServiceIndex > subscriptionBound.terminalIndex
            ) {
              return yield* new ZerospinError({
                code: 'generation-subscription-source-watermark-invalid',
                message:
                  'A source account subscription is beyond its captured service bound',
                extra: {
                  deployId,
                  generationId,
                  targetAccountRepoName,
                  serviceName: subscription.serviceName,
                  currentServiceIndex: subscription.currentServiceIndex,
                  terminalServiceIndex:
                    subscriptionBound?.terminalIndex ?? null,
                },
              });
            }
            const encodedRestored = yield* makeAsync(() =>
              targetAccountRepo.restoreReplaySubscription({
                serviceName: subscription.serviceName,
                currentServiceCursor: subscription.currentServiceCursor,
                currentServiceIndex: subscription.currentServiceIndex,
              }),
            );
            const restored = yield* decodeRpc(encodedRestored);
            if (
              restored.serviceName !== subscription.serviceName ||
              restored.currentServiceCursor !==
                subscription.currentServiceCursor ||
              restored.currentServiceIndex !== subscription.currentServiceIndex
            ) {
              return yield* new ZerospinError({
                code: 'generation-subscription-restore-result-mismatch',
                message: 'Target AccountRepo restored a different subscription',
                extra: {
                  deployId,
                  generationId,
                  targetAccountRepoName,
                  serviceName: subscription.serviceName,
                },
              });
            }
          }

          yield* Effect.try({
            try: () =>
              db
                .insert(replayCompletionsTable)
                .values({
                  deployId,
                  repoType: 'AccountRepo',
                  prevRepoName: sourceAccountRegistration.repoName,
                  targetRepoName: targetAccountRepoName,
                  terminalIndex: sourceBound?.terminalIndex ?? null,
                  blockCount: replayedBlockCount,
                  completedAt: new Date(),
                })
                .onConflictDoNothing()
                .run(),
            catch: ZerospinError.catch({
              code: 'generation-account-replay-completion-write-failed',
              message: 'Failed to store the target AccountRepo replay completion',
              extra: { deployId, generationId, targetAccountRepoName },
            }),
          });

          const storedCompletion = yield* Effect.try({
            try: () =>
              db
                .select()
                .from(replayCompletionsTable)
                .where(
                  and(
                    eq(replayCompletionsColumns.deployId, deployId),
                    eq(
                      replayCompletionsColumns.targetRepoName,
                      targetAccountRepoName,
                    ),
                  ),
                )
                .get(),
            catch: ZerospinError.catch({
              code: 'generation-account-replay-completion-verify-read-failed',
              message:
                'Failed to verify the target AccountRepo replay completion',
              extra: { deployId, generationId, targetAccountRepoName },
            }),
          });
          const verifiedCompletion = yield* Schema.decodeUnknown(
            Schema.Struct({
              repoType: Schema.Literal('ServiceRepo', 'AccountRepo'),
              prevRepoName: Schema.String,
              targetRepoName: Schema.String,
              terminalIndex: Schema.NullOr(Schema.Number),
              blockCount: Schema.Number,
            }),
          )(storedCompletion).pipe(
            mapParseError({
              code: 'generation-account-replay-completion-verify-invalid',
              prefix: 'Stored target AccountRepo replay completion is invalid',
              extra: { deployId, generationId, targetAccountRepoName },
            }),
          );
          if (
            verifiedCompletion.repoType !== 'AccountRepo' ||
            verifiedCompletion.prevRepoName !==
              sourceAccountRegistration.repoName ||
            verifiedCompletion.targetRepoName !== targetAccountRepoName ||
            verifiedCompletion.terminalIndex !==
              (sourceBound?.terminalIndex ?? null) ||
            verifiedCompletion.blockCount !== replayedBlockCount
          ) {
            return yield* new ZerospinError({
              code: 'generation-account-replay-completion-write-conflict',
              message:
                'Target AccountRepo replay completion changed during preparation',
              extra: { deployId, generationId, targetAccountRepoName },
            });
          }
        }

        // Checkpoint 7: source and target data-owner repo counts must match before
        // readiness. Block repos validate their own exact terminal bounds above.
        const targetServiceRepos = yield* getRepoRegistrations({
          db,
          repoTable,
          repoType: 'ServiceRepo',
        });
        const targetAccountRepos = yield* getRepoRegistrations({
          db,
          repoTable,
          repoType: 'AccountRepo',
        });
        if (
          targetServiceRepos.length !== sourceServiceRepos.length ||
          targetAccountRepos.length !== sourceAccountRepos.length
        ) {
          return yield* new ZerospinError({
            code: 'generation-target-repo-count-mismatch',
            message: 'Target data-owner repo counts do not match the predecessor',
            extra: {
              deployId,
              generationId,
              sourceServiceRepoCount: sourceServiceRepos.length,
              targetServiceRepoCount: targetServiceRepos.length,
              sourceAccountRepoCount: sourceAccountRepos.length,
              targetAccountRepoCount: targetAccountRepos.length,
            },
          });
        }
      }

      // Checkpoint 8: readiness and its timestamp commit only after all clean or
      // migration work and validation have completed.
      yield* Effect.try({
        try: () =>
          db
            .update(generationStateTable)
            .set({
              readiness: 'ready',
              readyAt: new Date(),
              failure: null,
            })
            .where(
              and(
                eq(generationStateColumns.generationId, generationId),
                eq(generationStateColumns.preparingDeployId, deployId),
                eq(generationStateColumns.readiness, 'initializing'),
              ),
            )
            .run(),
        catch: ZerospinError.catch({
          code: 'generation-ready-write-failed',
          message: 'Failed to mark target generation ready',
          extra: { deployId, generationId },
        }),
      });

      const rawReadyState = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(generationStateTable)
            .where(eq(generationStateColumns.generationId, generationId))
            .get(),
        catch: ZerospinError.catch({
          code: 'generation-ready-verification-read-failed',
          message: 'Failed to verify target generation readiness',
          extra: { deployId, generationId },
        }),
      });
      const readyState = yield* Schema.decodeUnknown(
        Schema.Struct({
          preparingDeployId: Schema.NullOr(Schema.String),
          readiness: Schema.Literal('initializing', 'ready', 'failed'),
        }),
      )(rawReadyState).pipe(
        mapParseError({
          code: 'generation-ready-verification-invalid',
          prefix: 'Stored target readiness is invalid',
          extra: { deployId, generationId },
        }),
      );
      if (
        readyState.preparingDeployId !== deployId ||
        readyState.readiness !== 'ready'
      ) {
        return yield* new ZerospinError({
          code: 'generation-ready-write-conflict',
          message: 'Target generation readiness changed during preparation',
          extra: {
            deployId,
            generationId,
            preparingDeployId: readyState.preparingDeployId,
            readiness: readyState.readiness,
          },
        });
      }

      return {
        deployId,
        generationId,
        readiness: 'ready',
        reusedGeneration: false,
      } satisfies Readonly<{
        deployId: string;
        generationId: string;
        readiness: 'ready';
        reusedGeneration: boolean;
      }>;
    }).pipe(
      Effect.tapError(error =>
        Effect.try({
          try: () =>
            db
              .update(generationStateTable)
              .set({
                readiness: 'failed',
                admission: 'closed',
                failure: ZerospinError.prettyUnknownFailure(error),
              })
              .where(
                and(
                  eq(generationStateColumns.generationId, generationId),
                  eq(generationStateColumns.initialDeployId, deployId),
                  eq(generationStateColumns.preparingDeployId, deployId),
                ),
              )
              .run(),
          catch: ZerospinError.catch({
            code: 'generation-failure-write-failed',
            message: 'Failed to persist target generation preparation failure',
            extra: { deployId, generationId },
          }),
        }),
      ),
      Effect.provideService(TelemetryCollector, makeTelemetryCollector()),
    );
  },
);
