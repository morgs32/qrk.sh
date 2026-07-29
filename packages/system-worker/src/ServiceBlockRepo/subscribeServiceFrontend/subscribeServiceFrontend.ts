import { RoutePattern } from '@remix-run/route-pattern';
import type { Async } from '@zerospin/core/async/Async';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { makeRepoNameUtils } from '../../makeRepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { drainServiceFrontendSubscribers } from '../drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/*
 * 1. Validate the exact actor/frontend subscriber identity and source watermark.
 * 2. In one SQL transaction, register at N and capture terminal T.
 * 3. Preserve any already-acknowledged watermark on an idempotent retry.
 * 4. Synchronously deliver through T and verify that the subscriber is live.
 */
export const subscribeServiceFrontend = Effect.fn(
  'ServiceBlockRepo.subscribeServiceFrontend',
)(function* (props: {
  serviceFrontendRepoName: string;
  serviceName: string;
  actorName: string;
  actorId: string;
  frontendName: string;
  currentServiceCursor: IServiceCursorId | null;
  currentServiceIndex: number | null;
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
  };
}): Effect.fn.Return<
  Readonly<{
    throughServiceCursor: IServiceCursorId | null;
    throughServiceIndex: number | null;
  }>,
  IAnyError,
  Async
> {
  const {
    actorName,
    currentServiceCursor,
    currentServiceIndex,
    db,
    frontendName,
    key,
    serviceName,
  } = props;

  // 1 — nullable source cursor and index are one inseparable watermark.
  const serviceFrontendRepoName = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(systemWorkerAbbreviations.serviceFrontendRepo),
  )(props.serviceFrontendRepoName).pipe(
    mapParseError({
      code: 'service-block-service-frontend-repo-name-invalid',
      prefix: 'Failed to decode ServiceBlockRepo serviceFrontendRepoName',
    }),
  );
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(props.actorId).pipe(
    mapParseError({
      code: 'service-block-service-frontend-actor-id-invalid',
      prefix: 'Failed to decode ServiceBlockRepo service frontend actorId',
    }),
  );
  const serviceFrontendRepoKey = yield* makeRepoNameUtils({
    abbreviation: systemWorkerAbbreviations.serviceFrontendRepo,
    namePattern: RoutePattern.parse(
      '/:generationId/:serviceName/:actorName/:actorId/:frontendName',
    ),
  })
    .parseName(serviceFrontendRepoName)
    .pipe(
      Effect.mapError(
        error =>
          new ZerospinError({
            code: 'service-block-service-frontend-repo-name-invalid',
            message:
              'ServiceBlockRepo serviceFrontendRepoName must encode one exact service frontend target',
            cause: error.message,
          }),
      ),
    );
  if (
    serviceName !== key.serviceName ||
    serviceFrontendRepoKey.generationId !== key.generationId ||
    serviceFrontendRepoKey.serviceName !== key.serviceName
  ) {
    return yield* new ZerospinError({
      code: 'service-block-service-frontend-source-target-mismatch',
      message:
        'Service frontend subscription repo name does not belong to the owning ServiceBlockRepo generation and service',
      extra: {
        source: key,
        received: {
          generationId: serviceFrontendRepoKey.generationId,
          serviceName: serviceFrontendRepoKey.serviceName,
        },
      },
    });
  }
  if (
    serviceFrontendRepoKey.actorName !== actorName ||
    serviceFrontendRepoKey.actorId !== actorId ||
    serviceFrontendRepoKey.frontendName !== frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-block-service-frontend-repo-target-mismatch',
      message:
        'Service frontend subscription repo name does not encode the supplied actor and frontend target',
      extra: {
        expected: {
          actorName,
          actorId,
          frontendName,
        },
        received: {
          actorName: serviceFrontendRepoKey.actorName,
          actorId: serviceFrontendRepoKey.actorId,
          frontendName: serviceFrontendRepoKey.frontendName,
        },
      },
    });
  }
  if (
    serviceName.length === 0 ||
    actorName.length === 0 ||
    actorId.length === 0 ||
    frontendName.length === 0 ||
    (currentServiceCursor === null) !== (currentServiceIndex === null) ||
    (currentServiceIndex !== null &&
      (!Number.isInteger(currentServiceIndex) || currentServiceIndex < 1))
  ) {
    return yield* new ZerospinError({
      code: 'service-block-service-frontend-subscription-invalid',
      message:
        'Service frontend subscription requires complete target identity and a paired nullable source watermark',
    });
  }

  // 2 — T is immutable for this catch-up attempt even if a later publish arrives.
  const bound = yield* makeTx({
    db,
    program: Effect.fn('ServiceBlockRepo.subscribeServiceFrontend.transaction')(
      function* ({ tx }) {
        const terminal = tx
          .select({
            lastServiceCursor:
              serviceBlockDrizzleSchemas.serviceBlocks.lastServiceCursor,
            serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
          })
          .from(serviceBlockDrizzleSchemas.serviceBlocks)
          .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
          .limit(1)
          .get();
        const existing = tx
          .select()
          .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
          .where(
            eq(
              serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                .serviceFrontendRepoName,
              serviceFrontendRepoName,
            ),
          )
          .get();

        let persistedServiceCursor = currentServiceCursor;
        let persistedServiceIndex = currentServiceIndex;
        if (existing !== undefined) {
          if (
            existing.serviceName !== serviceName ||
            existing.actorName !== actorName ||
            existing.actorId !== actorId ||
            existing.frontendName !== frontendName
          ) {
            return yield* new ZerospinError({
              code: 'service-block-service-frontend-subscription-conflict',
              message:
                'Service frontend subscriber repo name is already bound to a different target',
            });
          }
          const existingIndex = existing.currentServiceIndex ?? 0;
          const proposedIndex = currentServiceIndex ?? 0;
          if (existingIndex > proposedIndex) {
            persistedServiceCursor = existing.currentServiceCursor;
            persistedServiceIndex = existing.currentServiceIndex;
          } else if (
            existingIndex === proposedIndex &&
            existing.currentServiceCursor !== currentServiceCursor
          ) {
            return yield* new ZerospinError({
              code: 'service-block-service-frontend-watermark-conflict',
              message:
                'Service frontend subscriber has conflicting cursors at one service index',
            });
          }
          if (
            existing.status === 'catching-up' &&
            (existing.catchupThroughServiceCursor === null ||
              existing.catchupThroughServiceIndex === null)
          ) {
            return yield* new ZerospinError({
              code: 'service-block-service-frontend-catchup-bound-invalid',
              message:
                'Catching-up service frontend subscriber is missing its captured terminal bound',
            });
          }
        }

        const throughServiceCursor =
          existing?.status === 'catching-up'
            ? existing.catchupThroughServiceCursor
            : (terminal?.lastServiceCursor ?? null);
        const throughServiceIndex =
          existing?.status === 'catching-up'
            ? existing.catchupThroughServiceIndex
            : (terminal?.serviceIndex ?? null);
        const requiresCatchup =
          throughServiceIndex !== null &&
          (persistedServiceIndex ?? 0) < throughServiceIndex;
        const row = {
          serviceFrontendRepoName,
          serviceName,
          actorName,
          actorId,
          frontendName,
          currentServiceCursor: persistedServiceCursor,
          currentServiceIndex: persistedServiceIndex,
          catchupThroughServiceCursor: requiresCatchup
            ? throughServiceCursor
            : null,
          catchupThroughServiceIndex: requiresCatchup
            ? throughServiceIndex
            : null,
          status: requiresCatchup ? 'catching-up' : 'live',
          lastDeliveryError: null,
        } satisfies typeof serviceBlockDrizzleSchemas.serviceFrontendSubscribers.$inferInsert;
        if (existing === undefined) {
          tx.insert(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
            .values(row)
            .run();
        } else {
          tx.update(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
            .set(row)
            .where(
              eq(
                serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                  .serviceFrontendRepoName,
                serviceFrontendRepoName,
              ),
            )
            .run();
        }
        return { throughServiceCursor, throughServiceIndex };
      },
    ),
  });

  // 4 — this is deliberately not a waitUntil-only initialization launch.
  yield* drainServiceFrontendSubscribers({
    db,
    key,
    onlyServiceFrontendRepoName: serviceFrontendRepoName,
    failFast: true,
  });
  const caughtUp = db
    .select()
    .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
    .where(
      eq(
        serviceBlockDrizzleSchemas.serviceFrontendSubscribers
          .serviceFrontendRepoName,
        serviceFrontendRepoName,
      ),
    )
    .get();
  if (
    caughtUp === undefined ||
    caughtUp.status !== 'live' ||
    (bound.throughServiceIndex !== null &&
      (caughtUp.currentServiceIndex ?? 0) < bound.throughServiceIndex)
  ) {
    return yield* new ZerospinError({
      code: 'service-block-service-frontend-catchup-incomplete',
      message:
        'Service frontend subscriber did not acknowledge the captured catch-up bound',
    });
  }
  return bound;
});
