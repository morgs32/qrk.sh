/*
 * System-worker annotation:
 * Closes generation writes, drains every registered authoritative workflow in
 * dependency order, and captures immutable service/account replay bounds.
 */

import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { Async } from '@zerospin/core/async/Async';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { and, asc, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { AccountBlockRepo } from '../../AccountBlockRepo/AccountBlockRepo.js';
import { getAccountBlockRepo } from '../../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { AccountRepo } from '../../AccountRepo/AccountRepo.js';
import { getAccountRepo } from '../../AccountRepo/getAccountRepo/getAccountRepo.js';
import { FrontendRepo } from '../../FrontendRepo/FrontendRepo.js';
import { getFrontendRepo } from '../../FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { ServiceBlockRepo } from '../../ServiceBlockRepo/ServiceBlockRepo.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { getServiceRepo } from '../../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { getRepoRegistrations } from '../getRepoRegistrations/getRepoRegistrations.js';

export const drainGeneration = Effect.fn('SystemRepo.drainGeneration')(
  function* (props: {
    db: IDb;
    deployId: string;
    generationId: string;
    generationStateTable: IAnyDrizzleSchema;
    generationStateColumns: Readonly<{
      activeDeployId: AnyColumn;
      admission: AnyColumn;
      generationId: AnyColumn;
    }>;
    drainBoundsTable: IAnyDrizzleSchema;
    drainBoundsColumns: Readonly<{
      deployId: AnyColumn;
      repoName: AnyColumn;
    }>;
    repoTable: IAnyDrizzleSchema;
  }): Effect.fn.Return<
    Readonly<{
      deployId: string;
      generationId: string;
      admission: 'drained';
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
    } = props;

    // Checkpoint 1: only the generation-local active deploy can close admission.
    const rawGenerationState = yield* Effect.try({
      try: () =>
        db
          .select()
          .from(generationStateTable)
          .where(eq(generationStateColumns.generationId, generationId))
          .get(),
      catch: ZerospinError.catch({
        code: 'generation-drain-state-read-failed',
        message: 'Failed to read generation state before drain',
        extra: { deployId, generationId },
      }),
    });
    if (rawGenerationState === undefined) {
      return yield* new ZerospinError({
        code: 'generation-drain-not-prepared',
        message: 'The generation cannot drain before it is prepared',
        extra: { deployId, generationId },
      });
    }
    const generationState = yield* Schema.decodeUnknown(
      Schema.Struct({
        activeDeployId: Schema.NullOr(Schema.String),
        readiness: Schema.Literal('initializing', 'ready', 'failed'),
        admission: Schema.Literal('closed', 'open', 'draining', 'drained'),
      }),
    )(rawGenerationState).pipe(
      mapParseError({
        code: 'generation-drain-state-invalid',
        prefix: 'Stored generation state is invalid before drain',
        extra: { deployId, generationId },
      }),
    );
    if (generationState.activeDeployId !== deployId) {
      return yield* new ZerospinError({
        code: 'generation-drain-deploy-mismatch',
        message: 'Only the generation-local active deploy may drain',
        extra: {
          deployId,
          generationId,
          activeDeployId: generationState.activeDeployId,
        },
      });
    }
    if (generationState.readiness !== 'ready') {
      return yield* new ZerospinError({
        code: 'generation-drain-not-ready',
        message: 'Only a ready generation may drain',
        extra: {
          deployId,
          generationId,
          readiness: generationState.readiness,
        },
      });
    }
    if (generationState.admission === 'drained') {
      return { deployId, generationId, admission: 'drained' };
    }
    if (
      generationState.admission !== 'open' &&
      generationState.admission !== 'draining'
    ) {
      return yield* new ZerospinError({
        code: 'generation-drain-admission-closed',
        message: 'The generation is not open or already draining',
        extra: {
          deployId,
          generationId,
          admission: generationState.admission,
        },
      });
    }

    if (generationState.admission === 'open') {
      yield* Effect.try({
        try: () =>
          db
            .update(generationStateTable)
            .set({ admission: 'draining', drainedAt: null })
            .where(
              and(
                eq(generationStateColumns.generationId, generationId),
                eq(generationStateColumns.activeDeployId, deployId),
                eq(generationStateColumns.admission, 'open'),
              ),
            )
            .run(),
        catch: ZerospinError.catch({
          code: 'generation-drain-close-write-failed',
          message: 'Failed to close generation write admission',
          extra: { deployId, generationId },
        }),
      });
    }

    // Checkpoint 2: each dependency level is fully drained before the next one
    // can create or publish downstream work.
    const frontendRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'FrontendRepo',
    });
    for (const registration of frontendRepos) {
      const key = yield* FrontendRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const frontendRepo = yield* getFrontendRepo({ key });
      const encoded = yield* makeAsync(() =>
        frontendRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (
        result.pendingPushedBlockCount !== 0 ||
        result.pendingFrontendBlockCount !== 0
      ) {
        return yield* new ZerospinError({
          code: 'frontend-generation-drain-postcondition-failed',
          message: 'FrontendRepo reported pending work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const serviceRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceRepo',
    });
    for (const registration of serviceRepos) {
      const key = yield* ServiceRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceRepo = yield* getServiceRepo({ key });
      const encoded = yield* makeAsync(() =>
        serviceRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (result.pendingServiceBlockCount !== 0) {
        return yield* new ZerospinError({
          code: 'service-generation-drain-postcondition-failed',
          message: 'ServiceRepo reported pending work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const serviceBlockReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceBlockRepo',
    });
    for (const registration of serviceBlockReposToDrain) {
      const key = yield* ServiceBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceBlockRepo = yield* getServiceBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        serviceBlockRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (result.pendingAccountSubscriberCount !== 0) {
        return yield* new ZerospinError({
          code: 'service-block-generation-drain-postcondition-failed',
          message:
            'ServiceBlockRepo reported pending subscribers after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const accountRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'AccountRepo',
    });
    for (const registration of accountRepos) {
      const key = yield* AccountRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const accountRepo = yield* getAccountRepo({ key });
      const encoded = yield* makeAsync(() =>
        accountRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (
        result.pendingServiceSubscriptionCount !== 0 ||
        result.pendingAccountBlockCount !== 0
      ) {
        return yield* new ZerospinError({
          code: 'account-generation-drain-postcondition-failed',
          message: 'AccountRepo reported pending work after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    const accountBlockReposToDrain = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'AccountBlockRepo',
    });
    for (const registration of accountBlockReposToDrain) {
      const key = yield* AccountBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const accountBlockRepo = yield* getAccountBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        accountBlockRepo.drainGeneration(),
      );
      const result = yield* decodeRpc(encoded);
      if (result.pendingActorSubscriberCount !== 0) {
        return yield* new ZerospinError({
          code: 'account-block-generation-drain-postcondition-failed',
          message:
            'AccountBlockRepo reported pending subscribers after generation drain',
          extra: { repoName: registration.repoName, ...result },
        });
      }
    }

    // Checkpoint 3: re-read block registrations after downstream drain because
    // accepted work may have created a block repo that was absent at step start.
    const serviceBlockRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'ServiceBlockRepo',
    });
    for (const registration of serviceBlockRepos) {
      const key = yield* ServiceBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const serviceBlockRepo = yield* getServiceBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        serviceBlockRepo.getReplayBound(),
      );
      const bound = yield* decodeRpc(encoded);
      if (
        (bound.lastServiceCursor === null) !== (bound.serviceIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'service-replay-bound-inconsistent',
          message: 'Service replay cursor and index must both be null or present',
          extra: { repoName: registration.repoName, ...bound },
        });
      }
      const stored = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(
              and(
                eq(drainBoundsColumns.deployId, deployId),
                eq(drainBoundsColumns.repoName, registration.repoName),
              ),
            )
            .get(),
        catch: ZerospinError.catch({
          code: 'service-replay-bound-read-failed',
          message: 'Failed to read stored service replay bound',
          extra: { deployId, generationId, repoName: registration.repoName },
        }),
      });
      if (stored === undefined) {
        yield* Effect.try({
          try: () =>
            db
              .insert(drainBoundsTable)
              .values({
                deployId,
                repoType: 'ServiceBlockRepo',
                repoName: registration.repoName,
                terminalCursor: bound.lastServiceCursor,
                terminalIndex: bound.serviceIndex,
                capturedAt: new Date(),
              })
              .onConflictDoNothing()
              .run(),
          catch: ZerospinError.catch({
            code: 'service-replay-bound-write-failed',
            message: 'Failed to store service replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        });
      } else {
        const decodedStored = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal('ServiceBlockRepo', 'AccountBlockRepo'),
            terminalCursor: Schema.NullOr(Schema.String),
            terminalIndex: Schema.NullOr(Schema.Number),
          }),
        )(stored).pipe(
          mapParseError({
            code: 'stored-service-replay-bound-invalid',
            prefix: 'Stored service replay bound is invalid',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        );
        if (
          decodedStored.repoType !== 'ServiceBlockRepo' ||
          decodedStored.terminalCursor !== bound.lastServiceCursor ||
          decodedStored.terminalIndex !== bound.serviceIndex
        ) {
          return yield* new ZerospinError({
            code: 'service-replay-bound-conflict',
            message: 'A drain retry observed a different service replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          });
        }
      }
    }

    const accountBlockRepos = yield* getRepoRegistrations({
      db,
      repoTable,
      repoType: 'AccountBlockRepo',
    });
    for (const registration of accountBlockRepos) {
      const key = yield* AccountBlockRepo.repoUtils.nameUtils.parseName(
        registration.repoName,
      );
      const accountBlockRepo = yield* getAccountBlockRepo({ key });
      const encoded = yield* makeAsync(() =>
        accountBlockRepo.getReplayBound(),
      );
      const bound = yield* decodeRpc(encoded);
      if (
        (bound.lastAccountCursor === null) !== (bound.accountIndex === null)
      ) {
        return yield* new ZerospinError({
          code: 'account-replay-bound-inconsistent',
          message: 'Account replay cursor and index must both be null or present',
          extra: { repoName: registration.repoName, ...bound },
        });
      }
      const stored = yield* Effect.try({
        try: () =>
          db
            .select()
            .from(drainBoundsTable)
            .where(
              and(
                eq(drainBoundsColumns.deployId, deployId),
                eq(drainBoundsColumns.repoName, registration.repoName),
              ),
            )
            .get(),
        catch: ZerospinError.catch({
          code: 'account-replay-bound-read-failed',
          message: 'Failed to read stored account replay bound',
          extra: { deployId, generationId, repoName: registration.repoName },
        }),
      });
      if (stored === undefined) {
        yield* Effect.try({
          try: () =>
            db
              .insert(drainBoundsTable)
              .values({
                deployId,
                repoType: 'AccountBlockRepo',
                repoName: registration.repoName,
                terminalCursor: bound.lastAccountCursor,
                terminalIndex: bound.accountIndex,
                capturedAt: new Date(),
              })
              .onConflictDoNothing()
              .run(),
          catch: ZerospinError.catch({
            code: 'account-replay-bound-write-failed',
            message: 'Failed to store account replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        });
      } else {
        const decodedStored = yield* Schema.decodeUnknown(
          Schema.Struct({
            repoType: Schema.Literal('ServiceBlockRepo', 'AccountBlockRepo'),
            terminalCursor: Schema.NullOr(Schema.String),
            terminalIndex: Schema.NullOr(Schema.Number),
          }),
        )(stored).pipe(
          mapParseError({
            code: 'stored-account-replay-bound-invalid',
            prefix: 'Stored account replay bound is invalid',
            extra: { deployId, generationId, repoName: registration.repoName },
          }),
        );
        if (
          decodedStored.repoType !== 'AccountBlockRepo' ||
          decodedStored.terminalCursor !== bound.lastAccountCursor ||
          decodedStored.terminalIndex !== bound.accountIndex
        ) {
          return yield* new ZerospinError({
            code: 'account-replay-bound-conflict',
            message: 'A drain retry observed a different account replay bound',
            extra: { deployId, generationId, repoName: registration.repoName },
          });
        }
      }
    }

    // Checkpoint 4: readiness for replay begins only after every immutable bound
    // is durably present for this active deploy.
    const storedBounds = yield* Effect.try({
      try: () =>
        db
          .select({ repoName: drainBoundsColumns.repoName })
          .from(drainBoundsTable)
          .where(eq(drainBoundsColumns.deployId, deployId))
          .orderBy(asc(drainBoundsColumns.repoName))
          .all(),
      catch: ZerospinError.catch({
        code: 'generation-replay-bounds-verification-read-failed',
        message: 'Failed to verify captured generation replay bounds',
        extra: { deployId, generationId },
      }),
    });
    if (
      storedBounds.length !==
      serviceBlockRepos.length + accountBlockRepos.length
    ) {
      return yield* new ZerospinError({
        code: 'generation-replay-bounds-incomplete',
        message: 'Not every registered block repo has a captured replay bound',
        extra: {
          deployId,
          generationId,
          expectedBoundCount:
            serviceBlockRepos.length + accountBlockRepos.length,
          storedBoundCount: storedBounds.length,
        },
      });
    }

    yield* Effect.try({
      try: () =>
        db
          .update(generationStateTable)
          .set({ admission: 'drained', drainedAt: new Date() })
          .where(
            and(
              eq(generationStateColumns.generationId, generationId),
              eq(generationStateColumns.activeDeployId, deployId),
              eq(generationStateColumns.admission, 'draining'),
            ),
          )
          .run(),
      catch: ZerospinError.catch({
        code: 'generation-drain-complete-write-failed',
        message: 'Failed to mark generation drain complete',
        extra: { deployId, generationId },
      }),
    });

    return { deployId, generationId, admission: 'drained' };
  },
);
