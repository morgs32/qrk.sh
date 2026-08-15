/*
 * System-worker annotation:
 * Prepares a closed root or continuously advances a migrating linked
 * generation from immutable service ledgers before aggregate ledgers.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AggregateBlockRepo } from '../../AggregateBlockRepo/AggregateBlockRepo.js';
import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { AggregateRepo } from '../../AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from '../../AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';
import { registerRepo } from '../registerRepo/registerRepo.js';

export const prepareGeneration = Effect.fn('SystemRepo.prepareGeneration')(
  function* (props: {
    db: IDb;
    activationGuard: Effect.Effect<void>;
    configuredSystemId: string;
    deployId: string;
    generationId: string;
    prevGenerationId: string | null;
    restoreSubscriptions: boolean;
    systemSpec: ISystemSpec;
    seeds: readonly IDeploySeedCommand[];
    submitTargetedSeed: (props: {
      generationId: string;
      seed: IDeploySeedCommand;
    }) => Effect.Effect<void, IAnyError, Async>;
    drainSystemWrites: (props: {
      generationId: string;
      throughWriteIndex: number | null;
      includeHeld?: true;
    }) => Effect.Effect<void, IAnyError, Async>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      generationId: AnyColumn;
      phase: AnyColumn;
      preparingDeployId: AnyColumn;
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
  }): Effect.fn.Return<
    Readonly<{
      deployId: string;
      generationId: string;
      phase: 'closed' | 'migrating' | 'open';
      reusedGeneration: boolean;
    }>,
    IAnyError,
    Async
  > {
    const {
      db,
      configuredSystemId,
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
        message: 'A generation cannot name itself as predecessor',
        extra: { deployId, generationId },
      });
    }
    if (prevGenerationId !== null && seeds.length !== 0) {
      return yield* new ZerospinError({
        code: 'generation-migration-seeds-not-allowed',
        message: 'Linked generation preparation cannot run lifecycle seeds',
        extra: { deployId, generationId, seedCount: seeds.length },
      });
    }

    const encodedSystemSpec = yield* Schema.encode(
      Schema.parseJson(SystemSpecSchema),
    )(systemSpec).pipe(
      mapParseError({
        code: 'generation-system-spec-encode-failed',
        prefix: 'Failed to encode candidate SystemSpec',
        extra: { deployId, generationId },
      }),
    );

    yield* props.activationGuard;
    const rawStored = db
      .select()
      .from(generationStateTable)
      .where(eq(generationStateColumns.generationId, generationId))
      .get();
    if (rawStored === undefined) {
      yield* Effect.try({
        try: () =>
          db
            .insert(generationStateTable)
            .values({
              generationId,
              prevGenerationId,
              successorGenerationId: null,
              initialDeployId: deployId,
              activeDeployId: null,
              preparingDeployId: deployId,
              phase: prevGenerationId === null ? 'closed' : 'migrating',
              lastWriteIndex: 0,
              activeSystemSpec: null,
              preparingSystemSpec: encodedSystemSpec,
              failure: null,
              createdAt: new Date(),
              readyAt: null,
              openedAt: null,
              drainFrozenAt: null,
              retirementCompletedAt: null,
              retiredAt: null,
            })
            .run(),
        catch: ZerospinError.catch({
          code: 'generation-prepare-state-write-failed',
          message: 'Failed to create generation preparation state',
          extra: { deployId, generationId, prevGenerationId },
        }),
      });
    } else {
      const stored = yield* Schema.decodeUnknown(
        Schema.Struct({
          generationId: Schema.String,
          prevGenerationId: Schema.NullOr(Schema.String),
          initialDeployId: Schema.String,
          activeDeployId: Schema.NullOr(Schema.String),
          preparingDeployId: Schema.NullOr(Schema.String),
          phase: Schema.Literal(
            'closed',
            'migrating',
            'open',
            'draining',
            'retired',
          ),
          activeSystemSpec: Schema.NullOr(Schema.String),
          preparingSystemSpec: Schema.NullOr(Schema.String),
          readyAt: Schema.NullOr(Schema.DateFromSelf),
        }),
      )(rawStored).pipe(
        mapParseError({
          code: 'generation-prepare-state-invalid',
          prefix: 'Stored generation preparation state is invalid',
          extra: { deployId, generationId },
        }),
      );
      if (
        stored.phase === 'open' &&
        stored.activeDeployId !== null &&
        stored.prevGenerationId === prevGenerationId
      ) {
        if (prevGenerationId !== null || seeds.length !== 0) {
          return yield* new ZerospinError({
            code: 'generation-reuse-input-invalid',
            message: 'Compatible reuse cannot replay a predecessor or seeds',
            extra: { deployId, generationId },
          });
        }
        if (stored.activeSystemSpec === null) {
          return yield* new ZerospinError({
            code: 'generation-reuse-active-system-spec-missing',
            message: 'Reusable generation has no active SystemSpec',
            extra: { deployId, generationId },
          });
        }
        const prior = yield* Schema.decodeUnknown(
          Schema.parseJson(SystemSpecSchema),
        )(stored.activeSystemSpec).pipe(
          mapParseError({
            code: 'generation-reuse-active-system-spec-invalid',
            prefix: 'Stored active SystemSpec is invalid',
            extra: { deployId, generationId },
          }),
        );
        const compatibility = yield* checkSystemCompatibility({
          prior,
          next: systemSpec,
        });
        if (
          compatibility.requiresNewGeneration ||
          compatibility.missingAdapters.length !== 0
        ) {
          return yield* new ZerospinError({
            code: 'generation-reuse-model-definitions-changed',
            message: 'The candidate requires a linked successor generation',
            extra: { deployId, generationId },
          });
        }
        yield* Effect.try({
          try: () =>
            db
              .update(generationStateTable)
              .set({
                preparingDeployId: deployId,
                preparingSystemSpec: encodedSystemSpec,
                readyAt: new Date(),
                failure: null,
              })
              .where(
                and(
                  eq(generationStateColumns.generationId, generationId),
                  eq(generationStateColumns.phase, 'open'),
                ),
              )
              .run(),
          catch: ZerospinError.catch({
            code: 'generation-reuse-prepare-write-failed',
            message: 'Failed to persist compatible generation preparation',
            extra: { deployId, generationId },
          }),
        });
        return {
          deployId,
          generationId,
          phase: 'open',
          reusedGeneration: true,
        };
      }
      if (
        stored.phase === 'closed' &&
        stored.readyAt !== null &&
        stored.initialDeployId === deployId &&
        stored.preparingDeployId === deployId &&
        stored.preparingSystemSpec === encodedSystemSpec &&
        stored.prevGenerationId === null
      ) {
        return {
          deployId,
          generationId,
          phase: 'closed',
          reusedGeneration: false,
        };
      }
      if (
        stored.initialDeployId !== deployId ||
        stored.preparingDeployId !== deployId ||
        stored.prevGenerationId !== prevGenerationId ||
        stored.preparingSystemSpec !== encodedSystemSpec ||
        (stored.phase !== 'closed' && stored.phase !== 'migrating')
      ) {
        return yield* new ZerospinError({
          code: 'generation-preparation-owned-by-another-deploy',
          message: 'Stored generation preparation conflicts with this deploy',
          extra: { deployId, generationId, phase: stored.phase },
        });
      }
    }

    yield* registerRepo({
      db,
      repoTable,
      registration: {
        generationId,
        repoType: 'SystemRepo',
        repoName: configuredSystemId,
        tableNames: [
          'selection',
          'deploy',
          'generationState',
          'drainBounds',
          'replayCompletions',
          'aggregateFrontendWebSocketTickets',
          'serviceFrontendWebSocketTickets',
          'systemWrites',
          'aggregates',
          'repos',
        ],
      },
    });

    if (prevGenerationId === null) {
      for (const seed of seeds) {
        yield* props.submitTargetedSeed({ generationId, seed });
        yield* props.activationGuard;
      }
      yield* props.drainSystemWrites({
        generationId,
        throughWriteIndex: null,
        includeHeld: true,
      });
    } else {
      // A fresh tip pair is read after each replay pass. Any new source block
      // changes a completion watermark and forces another service-first pass.
      while (true) {
        const before = yield* replayCurrentTips({
          db,
          activationGuard: props.activationGuard,
          sourceGenerationId: prevGenerationId,
          targetGenerationId: generationId,
          restoreSubscriptions: props.restoreSubscriptions,
          replayCompletionsTable,
          replayCompletionsColumns,
          repoTable,
        });
        const after = yield* readTipFingerprint({
          db,
          generationId: prevGenerationId,
          repoTable,
        });
        if (before === after) {
          break;
        }
      }
    }

    yield* props.activationGuard;
    yield* Effect.try({
      try: () =>
        db
          .update(generationStateTable)
          .set({ readyAt: new Date(), failure: null })
          .where(
            and(
              eq(generationStateColumns.generationId, generationId),
              eq(generationStateColumns.preparingDeployId, deployId),
            ),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'generation-prepared-write-failed',
        message: 'Failed to persist generation preparation completion',
        extra: { deployId, generationId },
      }),
    });

    return {
      deployId,
      generationId,
      phase: prevGenerationId === null ? 'closed' : 'migrating',
      reusedGeneration: false,
    };
  },
);

const readTipFingerprint = Effect.fn(
  'SystemRepo.prepareGeneration.readTipFingerprint',
)(function* (props: {
  db: IDb;
  generationId: string;
  repoTable: IAnyDrizzleSchema & {
    generationId: AnyColumn;
    repoType: AnyColumn;
    repoName: AnyColumn;
    tableNames: AnyColumn;
  };
}): Effect.fn.Return<string, IAnyError, Async> {
  const serviceBlocks = yield* getRepoRegistrations({
    db: props.db,
    generationId: props.generationId,
    repoTable: props.repoTable,
    repoType: 'ServiceBlockRepo',
  });
  const aggregateBlocks = yield* getRepoRegistrations({
    db: props.db,
    generationId: props.generationId,
    repoTable: props.repoTable,
    repoType: 'AggregateBlockRepo',
  });
  const tips: unknown[] = [];
  for (const registration of serviceBlocks) {
    const key = yield* ServiceBlockRepo.boundDORepoConfig.nameUtils.parseName(
      registration.repoName,
    );
    const repo = yield* getServiceBlockRepo({ key });
    const bound = yield* makeAsync(() => repo.getReplayBound()).pipe(
      Effect.flatMap(decodeRpc),
    );
    tips.push(['service', registration.repoName, bound]);
  }
  for (const registration of aggregateBlocks) {
    const key = yield* AggregateBlockRepo.boundDORepoConfig.nameUtils.parseName(
      registration.repoName,
    );
    const repo = yield* getAggregateBlockRepo({ key });
    const bound = yield* makeAsync(() => repo.getReplayBound()).pipe(
      Effect.flatMap(decodeRpc),
    );
    tips.push(['aggregate', registration.repoName, bound]);
  }
  return JSON.stringify(tips);
});

const replayCurrentTips = Effect.fn(
  'SystemRepo.prepareGeneration.replayCurrentTips',
)(function* (props: {
  db: IDb;
  activationGuard: Effect.Effect<void>;
  sourceGenerationId: string;
  targetGenerationId: string;
  restoreSubscriptions: boolean;
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
}): Effect.fn.Return<string, IAnyError, Async> {
  const fingerprint = yield* readTipFingerprint({
    db: props.db,
    generationId: props.sourceGenerationId,
    repoTable: props.repoTable,
  });

  const sourceServiceBlocks = yield* getRepoRegistrations({
    db: props.db,
    generationId: props.sourceGenerationId,
    repoTable: props.repoTable,
    repoType: 'ServiceBlockRepo',
  });
  for (const sourceRegistration of sourceServiceBlocks) {
    const sourceKey =
      yield* ServiceBlockRepo.boundDORepoConfig.nameUtils.parseName(
        sourceRegistration.repoName,
      );
    const sourceRepo = yield* getServiceBlockRepo({ key: sourceKey });
    const bound = yield* makeAsync(() => sourceRepo.getReplayBound()).pipe(
      Effect.flatMap(decodeRpc),
    );
    const targetKey = {
      generationId: props.targetGenerationId,
      serviceName: sourceKey.serviceName,
    };
    const targetRepoName =
      yield* ServiceRepo.boundDORepoConfig.nameUtils.makeName(targetKey);
    const existing = props.db
      .select()
      .from(props.replayCompletionsTable)
      .where(
        and(
          eq(
            props.replayCompletionsColumns.generationId,
            props.targetGenerationId,
          ),
          eq(props.replayCompletionsColumns.targetRepoName, targetRepoName),
        ),
      )
      .get();
    let afterIndex =
      typeof existing?.terminalIndex === 'number'
        ? existing.terminalIndex
        : null;
    let blockCount =
      typeof existing?.blockCount === 'number' ? existing.blockCount : 0;
    if (bound.serviceIndex !== null) {
      const throughServiceIndex = bound.serviceIndex;
      const targetRepo = yield* getServiceRepo({ key: targetKey });
      while (afterIndex === null || afterIndex < throughServiceIndex) {
        const block = yield* makeAsync(() =>
          sourceRepo.getReplayBlock({
            afterServiceIndex: afterIndex,
            throughServiceIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (block === null) {
          return yield* new ZerospinError({
            code: 'generation-service-replay-block-missing',
            message: 'Source service ledger is missing a block within its tip',
            extra: { sourceRepoName: sourceRegistration.repoName, afterIndex },
          });
        }
        const result = yield* makeAsync(() =>
          targetRepo.replayServiceBlock({
            prevGenerationId: props.sourceGenerationId,
            block,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        afterIndex = result.serviceIndex;
        blockCount += 1;
        yield* props.activationGuard;
      }
    }
    props.db
      .insert(props.replayCompletionsTable)
      .values({
        generationId: props.targetGenerationId,
        repoType: 'ServiceRepo',
        prevRepoName: sourceRegistration.repoName,
        targetRepoName,
        terminalCursor: bound.lastServiceCursor,
        terminalIndex: bound.serviceIndex,
        blockCount,
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          props.replayCompletionsColumns.generationId,
          props.replayCompletionsColumns.targetRepoName,
        ],
        set: {
          terminalCursor: bound.lastServiceCursor,
          terminalIndex: bound.serviceIndex,
          blockCount,
          completedAt: new Date(),
        },
      })
      .run();
  }

  const sourceAggregateBlocks = yield* getRepoRegistrations({
    db: props.db,
    generationId: props.sourceGenerationId,
    repoTable: props.repoTable,
    repoType: 'AggregateBlockRepo',
  });
  for (const sourceRegistration of sourceAggregateBlocks) {
    const sourceKey =
      yield* AggregateBlockRepo.boundDORepoConfig.nameUtils.parseName(
        sourceRegistration.repoName,
      );
    const sourceRepo = yield* getAggregateBlockRepo({ key: sourceKey });
    const bound = yield* makeAsync(() => sourceRepo.getReplayBound()).pipe(
      Effect.flatMap(decodeRpc),
    );
    const targetKey = {
      generationId: props.targetGenerationId,
      aggregateId: sourceKey.aggregateId,
      aggregateName: sourceKey.aggregateName,
    };
    const targetRepoName =
      yield* AggregateRepo.boundDORepoConfig.nameUtils.makeName(targetKey);
    const existing = props.db
      .select()
      .from(props.replayCompletionsTable)
      .where(
        and(
          eq(
            props.replayCompletionsColumns.generationId,
            props.targetGenerationId,
          ),
          eq(props.replayCompletionsColumns.targetRepoName, targetRepoName),
        ),
      )
      .get();
    let afterIndex =
      typeof existing?.terminalIndex === 'number'
        ? existing.terminalIndex
        : null;
    let blockCount =
      typeof existing?.blockCount === 'number' ? existing.blockCount : 0;
    if (bound.aggregateIndex !== null) {
      const throughAggregateIndex = bound.aggregateIndex;
      const targetRepo = yield* getAggregateRepo({ key: targetKey });
      while (afterIndex === null || afterIndex < throughAggregateIndex) {
        const block = yield* makeAsync(() =>
          sourceRepo.getReplayBlock({
            afterAggregateIndex: afterIndex,
            throughAggregateIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        if (block === null) {
          return yield* new ZerospinError({
            code: 'generation-aggregate-replay-block-missing',
            message:
              'Source aggregate ledger is missing a block within its tip',
            extra: { sourceRepoName: sourceRegistration.repoName, afterIndex },
          });
        }
        const result = yield* makeAsync(() =>
          targetRepo.replayAggregateBlock({
            prevGenerationId: props.sourceGenerationId,
            block,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        afterIndex = result.aggregateIndex;
        blockCount += 1;
        yield* props.activationGuard;
      }
    }
    props.db
      .insert(props.replayCompletionsTable)
      .values({
        generationId: props.targetGenerationId,
        repoType: 'AggregateRepo',
        prevRepoName: sourceRegistration.repoName,
        targetRepoName,
        terminalCursor: bound.lastAggregateCursor,
        terminalIndex: bound.aggregateIndex,
        blockCount,
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          props.replayCompletionsColumns.generationId,
          props.replayCompletionsColumns.targetRepoName,
        ],
        set: {
          terminalCursor: bound.lastAggregateCursor,
          terminalIndex: bound.aggregateIndex,
          blockCount,
          completedAt: new Date(),
        },
      })
      .run();

    if (props.restoreSubscriptions) {
      const sourceAggregateRepo = yield* getAggregateRepo({
        key: {
          generationId: props.sourceGenerationId,
          aggregateId: sourceKey.aggregateId,
          aggregateName: sourceKey.aggregateName,
        },
      });
      const subscriptions = yield* makeAsync(() =>
        sourceAggregateRepo.getReplaySubscriptions(),
      ).pipe(Effect.flatMap(decodeRpc));
      const targetAggregateRepo = yield* getAggregateRepo({ key: targetKey });
      for (const subscription of subscriptions) {
        yield* makeAsync(() =>
          targetAggregateRepo.restoreReplaySubscription({
            serviceName: subscription.serviceName,
            currentServiceCursor: subscription.currentServiceCursor,
            currentServiceIndex: subscription.currentServiceIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* props.activationGuard;
      }
    }
  }

  return fingerprint;
});
