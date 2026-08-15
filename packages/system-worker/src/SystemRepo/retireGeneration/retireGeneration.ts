/*
 * System-worker annotation:
 * Closes retired-generation frontend sockets after the durable retirement
 * phase is visible. Socket closure is cleanup, never the read fence.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { eq, type AnyColumn } from 'drizzle-orm';
import { Effect, type Schema } from 'effect';

import { AggregateFrontendBlockRepo } from '../../AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
import { getAggregateFrontendBlockRepo } from '../../AggregateFrontendBlockRepo/getAggregateFrontendBlockRepo/getAggregateFrontendBlockRepo.js';
import { getServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { ServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';

export const retireGeneration = Effect.fn('SystemRepo.retireGeneration')(
  function* (props: {
    db: IDb;
    activationGuard: Effect.Effect<void>;
    deployId: string;
    generationId: string;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      generationId: AnyColumn;
      phase: AnyColumn;
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
      phase: 'retired';
      closedSocketRepoCount: number;
    }>,
    IAnyError,
    Async
  > {
    yield* props.activationGuard;
    const state = props.db
      .select()
      .from(props.generationStateTable)
      .where(eq(props.generationStateColumns.generationId, props.generationId))
      .get();
    if (
      state === undefined ||
      state.phase !== 'retired' ||
      state.activeDeployId !== props.deployId
    ) {
      return yield* new ZerospinError({
        code: 'generation-retirement-fence-not-committed',
        message:
          'Frontend sockets cannot close before the generation is durably retired',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
          phase: state?.phase ?? null,
          activeDeployId: state?.activeDeployId ?? null,
        },
      });
    }

    let closedSocketRepoCount = 0;
    const aggregateRepos = yield* getRepoRegistrations({
      db: props.db,
      generationId: props.generationId,
      repoTable: props.repoTable,
      repoType: 'AggregateFrontendBlockRepo',
    });
    for (const registration of aggregateRepos) {
      const key =
        yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
          registration.repoName,
        );
      const repo = yield* getAggregateFrontendBlockRepo({ key });
      yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
        repo.drainGeneration(),
      ).pipe(Effect.flatMap(decodeRpc));
      closedSocketRepoCount += 1;
    }

    const serviceRepos = yield* getRepoRegistrations({
      db: props.db,
      generationId: props.generationId,
      repoTable: props.repoTable,
      repoType: 'ServiceFrontendBlockRepo',
    });
    for (const registration of serviceRepos) {
      const key =
        yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
          registration.repoName,
        );
      const repo = yield* getServiceFrontendBlockRepo({ key });
      yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(() =>
        repo.drainGeneration(),
      ).pipe(Effect.flatMap(decodeRpc));
      closedSocketRepoCount += 1;
    }

    yield* Effect.try({
      try: () =>
        props.db
          .update(props.generationStateTable)
          .set({ retirementCompletedAt: new Date() })
          .where(
            eq(props.generationStateColumns.generationId, props.generationId),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'generation-retirement-completion-write-failed',
        message: 'Failed to record retired socket closure completion',
        extra: {
          deployId: props.deployId,
          generationId: props.generationId,
        },
      }),
    });

    return {
      deployId: props.deployId,
      generationId: props.generationId,
      phase: 'retired',
      closedSocketRepoCount,
    };
  },
);
