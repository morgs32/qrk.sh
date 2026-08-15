/*
 * System-worker annotation:
 * Drains one finite generation consequence graph to a fixed point and stores
 * only authoritative immutable-ledger and exact subscriber watermarks.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import type { IRepoTableData } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { and, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';

import { AggregateBlockRepo } from '../../AggregateBlockRepo/AggregateBlockRepo.js';
import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { AggregateFrontendRepo } from '../../AggregateFrontendRepo/AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from '../../AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { AggregateRepo } from '../../AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from '../../AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceBlockRepo } from '../../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';

export const freezeGeneration = Effect.fn('SystemRepo.freezeGeneration')(
  function* (props: {
    db: IDb;
    activationGuard: Effect.Effect<void>;
    deployId: string;
    generationId: string;
    throughWriteIndex: number | null;
    drainSystemWrites: (props: {
      generationId: string;
      throughWriteIndex: number | null;
      includeHeld?: true;
    }) => Effect.Effect<void, IAnyError, Async>;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      drainFrozenAt: AnyColumn;
      generationId: AnyColumn;
      phase: AnyColumn;
      preparingDeployId: AnyColumn;
    }>;
    drainBoundsTable: IAnyDrizzleSchema;
    drainBoundsColumns: Readonly<{
      generationId: AnyColumn;
      repoType: AnyColumn;
      sourceRepoName: AnyColumn;
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
      phase: 'closed' | 'draining';
      throughWriteIndex: number | null;
    }>,
    IAnyError,
    Async
  > {
    const {
      db,
      deployId,
      drainBoundsColumns,
      drainBoundsTable,
      generationId,
      generationStateColumns,
      generationStateTable,
      repoTable,
      throughWriteIndex,
    } = props;

    yield* props.activationGuard;

    const state = db
      .select()
      .from(generationStateTable)
      .where(eq(generationStateColumns.generationId, generationId))
      .get();
    if (state === undefined) {
      return yield* new ZerospinError({
        code: 'generation-drain-not-prepared',
        message: 'The generation cannot drain before it is prepared',
        extra: { deployId, generationId },
      });
    }
    if (
      (state.phase !== 'closed' && state.phase !== 'draining') ||
      (state.phase === 'closed' && state.preparingDeployId !== deployId) ||
      (state.phase === 'draining' && state.activeDeployId !== deployId)
    ) {
      return yield* new ZerospinError({
        code: 'generation-drain-phase-invalid',
        message:
          'Only the exact preparing closed or active draining generation may be drained',
        extra: {
          deployId,
          generationId,
          activeDeployId: state.activeDeployId,
          phase: state.phase,
        },
      });
    }

    yield* props.drainSystemWrites({ generationId, throughWriteIndex });
    yield* props.activationGuard;

    let previousProof = '';
    while (true) {
      const aggregateFrontendRepos = yield* getRepoRegistrations({
        db,
        generationId,
        repoTable,
        repoType: 'AggregateFrontendRepo',
      });
      for (const registration of aggregateFrontendRepos) {
        const key =
          yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.parseName(
            registration.repoName,
          );
        const repo = yield* getAggregateFrontendRepo({ key });
        yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
          repo.drainPushBlockOutbox(),
        ).pipe(Effect.flatMap(decodeRpc));
      }

      const serviceRepos = yield* getRepoRegistrations({
        db,
        generationId,
        repoTable,
        repoType: 'ServiceRepo',
      });
      for (const registration of serviceRepos) {
        const key = yield* ServiceRepo.boundDORepoConfig.nameUtils.parseName(
          registration.repoName,
        );
        const repo = yield* getServiceRepo({ key });
        const result = yield* makeAsync(() => repo.drainGeneration()).pipe(
          Effect.flatMap(decodeRpc),
        );
        if (result.pendingServiceBlockCount !== 0) {
          return yield* new ZerospinError({
            code: 'service-generation-drain-incomplete',
            message: 'ServiceRepo retained pending block publication',
            extra: { repoName: registration.repoName, ...result },
          });
        }
      }

      const serviceBlockRepos = yield* getRepoRegistrations({
        db,
        generationId,
        repoTable,
        repoType: 'ServiceBlockRepo',
      });
      for (const registration of serviceBlockRepos) {
        const key =
          yield* ServiceBlockRepo.boundDORepoConfig.nameUtils.parseName(
            registration.repoName,
          );
        const repo = yield* getServiceBlockRepo({ key });
        yield* makeAsync(() => repo.drainAggregateSubscribers()).pipe(
          Effect.flatMap(decodeRpc),
        );
      }

      const aggregateRepos = yield* getRepoRegistrations({
        db,
        generationId,
        repoTable,
        repoType: 'AggregateRepo',
      });
      for (const registration of aggregateRepos) {
        const key = yield* AggregateRepo.boundDORepoConfig.nameUtils.parseName(
          registration.repoName,
        );
        const repo = yield* getAggregateRepo({ key });
        const result = yield* makeAsync(() => repo.drainGeneration()).pipe(
          Effect.flatMap(decodeRpc),
        );
        if (
          result.pendingServiceSubscriptionCount !== 0 ||
          result.pendingAggregateBlockCount !== 0
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-generation-drain-incomplete',
            message: 'AggregateRepo retained pending drain work',
            extra: { repoName: registration.repoName, ...result },
          });
        }
      }

      yield* props.activationGuard;
      const freshServiceBlocks = yield* getRepoRegistrations({
        db,
        generationId,
        repoTable,
        repoType: 'ServiceBlockRepo',
      });
      const freshAggregateBlocks = yield* getRepoRegistrations({
        db,
        generationId,
        repoTable,
        repoType: 'AggregateBlockRepo',
      });
      const proof: Array<{
        repoType:
          | 'ServiceBlockRepo'
          | 'AggregateBlockRepo'
          | 'ServiceBlockSubscriber';
        sourceRepoName: string;
        targetRepoName: string | null;
        terminalCursor: string | null;
        terminalIndex: number | null;
      }> = [];

      for (const registration of freshServiceBlocks) {
        const key =
          yield* ServiceBlockRepo.boundDORepoConfig.nameUtils.parseName(
            registration.repoName,
          );
        const repo = yield* getServiceBlockRepo({ key });
        const bound = yield* makeAsync(() => repo.getReplayBound()).pipe(
          Effect.flatMap(decodeRpc),
        );
        proof.push({
          repoType: 'ServiceBlockRepo',
          sourceRepoName: registration.repoName,
          targetRepoName: null,
          terminalCursor: bound.lastServiceCursor,
          terminalIndex: bound.serviceIndex,
        });

        const rows = yield* makeAsync<
          Schema.EitherEncoded<IRepoTableData, IAnyErrorJson>
        >(() =>
          repo.getRepoTableRows({ tableName: 'aggregateSubscribers' }),
        ).pipe(Effect.flatMap(decodeRpc));
        for (const row of rows.rows) {
          const targetRepoName = row.aggregateRepoName;
          const terminalCursor = row.currentServiceCursor;
          const terminalIndex = row.currentServiceIndex;
          if (
            typeof targetRepoName !== 'string' ||
            typeof terminalCursor !== 'string' ||
            typeof terminalIndex !== 'number'
          ) {
            return yield* new ZerospinError({
              code: 'service-block-subscriber-watermark-invalid',
              message:
                'ServiceBlockRepo exposed an invalid aggregate watermark',
              extra: { repoName: registration.repoName },
            });
          }
          proof.push({
            repoType: 'ServiceBlockSubscriber',
            sourceRepoName: registration.repoName,
            targetRepoName,
            terminalCursor,
            terminalIndex,
          });
        }
      }

      for (const registration of freshAggregateBlocks) {
        const key =
          yield* AggregateBlockRepo.boundDORepoConfig.nameUtils.parseName(
            registration.repoName,
          );
        const repo = yield* getAggregateBlockRepo({ key });
        const bound = yield* makeAsync(() => repo.getReplayBound()).pipe(
          Effect.flatMap(decodeRpc),
        );
        proof.push({
          repoType: 'AggregateBlockRepo',
          sourceRepoName: registration.repoName,
          targetRepoName: null,
          terminalCursor: bound.lastAggregateCursor,
          terminalIndex: bound.aggregateIndex,
        });
      }

      proof.sort((left, right) =>
        `${left.repoType}/${left.sourceRepoName}/${left.targetRepoName ?? ''}`.localeCompare(
          `${right.repoType}/${right.sourceRepoName}/${right.targetRepoName ?? ''}`,
        ),
      );
      const currentProof = JSON.stringify(proof);
      if (currentProof !== previousProof) {
        previousProof = currentProof;
        continue;
      }

      yield* Effect.try({
        try: () =>
          db.transaction(tx => {
            tx.delete(drainBoundsTable)
              .where(eq(drainBoundsColumns.generationId, generationId))
              .run();
            const capturedAt = new Date();
            for (const bound of proof) {
              tx.insert(drainBoundsTable)
                .values({ generationId, ...bound, capturedAt })
                .run();
            }
            tx.update(generationStateTable)
              .set({ drainFrozenAt: capturedAt })
              .where(
                and(
                  eq(generationStateColumns.generationId, generationId),
                  eq(generationStateColumns.phase, state.phase),
                ),
              )
              .run();
          }),
        catch: ZerospinError.catch({
          code: 'generation-fixed-point-proof-write-failed',
          message: 'Failed to store generation fixed-point proof',
          extra: { deployId, generationId },
        }),
      });
      break;
    }

    return { deployId, generationId, phase: state.phase, throughWriteIndex };
  },
);
