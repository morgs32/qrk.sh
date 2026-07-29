import { RoutePattern } from '@remix-run/route-pattern';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import { makeRepoNameUtils } from '../../makeRepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import type { IServiceBlock } from '../../types.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

/*
 * 1. Keep a catching-up subscriber pinned to its captured T.
 * 2. Let a live subscriber capture the current archive terminal for this drain.
 * 3. Require the complete exact-next source suffix before delivery.
 * 4. Acknowledge only after ServiceFrontendRepo has archived every emitted block.
 * 5. Retry transient delivery failures in this invocation and persist only a
 *    terminal diagnostic plus the next shared-alarm deadline after the retry
 *    schedule is exhausted.
 */
export const drainServiceFrontendSubscribers = Effect.fn(
  'ServiceBlockRepo.drainServiceFrontendSubscribers',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
  };
  onlyServiceFrontendRepoName: string | null;
  failFast: boolean;
}): Effect.fn.Return<number | null, IAnyError, Async> {
  const { db, failFast, key, onlyServiceFrontendRepoName } = props;
  const subscribers = db
    .select()
    .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
    .all();
  let nextRetryAt: number | null = null;
  for (const subscriber of subscribers) {
    if (
      onlyServiceFrontendRepoName !== null &&
      subscriber.serviceFrontendRepoName !== onlyServiceFrontendRepoName
    ) {
      continue;
    }
    const serviceFrontendRepoKey = yield* makeRepoNameUtils({
      abbreviation: systemWorkerAbbreviations.serviceFrontendRepo,
      namePattern: RoutePattern.parse(
        '/:generationId/:serviceName/:actorName/:actorId/:frontendName',
      ),
    })
      .parseName(subscriber.serviceFrontendRepoName)
      .pipe(
        Effect.mapError(
          error =>
            new ZerospinError({
              code: 'service-block-service-frontend-repo-name-invalid',
              message:
                'Stored serviceFrontendRepoName must encode one exact service frontend target',
              cause: error.message,
            }),
        ),
      );
    if (
      subscriber.serviceName !== key.serviceName ||
      serviceFrontendRepoKey.generationId !== key.generationId ||
      serviceFrontendRepoKey.serviceName !== key.serviceName
    ) {
      return yield* new ZerospinError({
        code: 'service-block-service-frontend-source-target-mismatch',
        message:
          'Stored service frontend subscriber does not belong to the owning ServiceBlockRepo generation and service',
      });
    }
    if (
      serviceFrontendRepoKey.actorName !== subscriber.actorName ||
      serviceFrontendRepoKey.actorId !== subscriber.actorId ||
      serviceFrontendRepoKey.frontendName !== subscriber.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-block-service-frontend-repo-target-mismatch',
        message:
          'Stored service frontend subscriber target does not match its deterministic repo name',
      });
    }

    // 1/2 — catch-up never extends T; ordinary live delivery captures a fresh bound.
    const terminal = db
      .select({
        lastServiceCursor:
          serviceBlockDrizzleSchemas.serviceBlocks.lastServiceCursor,
        serviceIndex: serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
      })
      .from(serviceBlockDrizzleSchemas.serviceBlocks)
      .orderBy(desc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex))
      .limit(1)
      .get();
    const throughServiceIndex =
      subscriber.status === 'catching-up'
        ? subscriber.catchupThroughServiceIndex
        : (terminal?.serviceIndex ?? null);
    if (
      throughServiceIndex === null ||
      (subscriber.currentServiceIndex ?? 0) >= throughServiceIndex
    ) {
      if (subscriber.status === 'catching-up') {
        db.update(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
          .set({
            status: 'live',
            catchupThroughServiceCursor: null,
            catchupThroughServiceIndex: null,
            lastDeliveryError: null,
          })
          .where(
            eq(
              serviceBlockDrizzleSchemas.serviceFrontendSubscribers
                .serviceFrontendRepoName,
              subscriber.serviceFrontendRepoName,
            ),
          )
          .run();
      }
      continue;
    }

    const delivery = yield* Effect.gen(function* () {
      const rows =
        subscriber.currentServiceIndex === null
          ? db
              .select()
              .from(serviceBlockDrizzleSchemas.serviceBlocks)
              .where(
                lte(
                  serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
                  throughServiceIndex,
                ),
              )
              .orderBy(
                asc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex),
              )
              .all()
          : db
              .select()
              .from(serviceBlockDrizzleSchemas.serviceBlocks)
              .where(
                and(
                  gt(
                    serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
                    subscriber.currentServiceIndex,
                  ),
                  lte(
                    serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
                    throughServiceIndex,
                  ),
                ),
              )
              .orderBy(
                asc(serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex),
              )
              .all();
      const blocks: IServiceBlock[] = [];
      let expectedServiceIndex = (subscriber.currentServiceIndex ?? 0) + 1;
      for (const row of rows) {
        if (row.serviceIndex !== expectedServiceIndex) {
          return yield* new ZerospinError({
            code: 'service-block-service-frontend-archive-gap',
            message: `ServiceBlockRepo archive is missing service index ${expectedServiceIndex}`,
          });
        }
        const block = yield* Schema.decodeUnknown(
          Schema.parseJson(ServiceBlockSchema),
        )(row.block).pipe(
          mapParseError({
            code: 'service-block-service-frontend-block-invalid',
            prefix: `Failed to decode service block ${row.serviceIndex} for service frontend delivery`,
          }),
        );
        if (
          block.serviceIndex !== row.serviceIndex ||
          block.lastServiceCursor !== row.lastServiceCursor
        ) {
          return yield* new ZerospinError({
            code: 'service-block-service-frontend-watermark-mismatch',
            message: `ServiceBlockRepo archive row ${row.serviceIndex} does not match its encoded block`,
          });
        }
        blocks.push(block);
        expectedServiceIndex += 1;
      }
      if (expectedServiceIndex !== throughServiceIndex + 1) {
        return yield* new ZerospinError({
          code: 'service-block-service-frontend-archive-gap',
          message: `ServiceBlockRepo archive does not cover service frontend catch-up through ${throughServiceIndex}`,
        });
      }
      const lastBlock = blocks.at(-1);
      if (lastBlock === undefined) {
        return yield* new ZerospinError({
          code: 'service-block-service-frontend-archive-gap',
          message:
            'ServiceBlockRepo selected no blocks for a non-empty service frontend suffix',
        });
      }

      // 4 — this RPC returns only after projection and archive commits complete.
      const serviceFrontendRepo = env.SERVICE_FRONTEND_REPO.getByName(
        subscriber.serviceFrontendRepoName,
      );
      const deliveryUnknown = yield* makeAsync(() =>
        serviceFrontendRepo.handleServiceBlocks({
          serviceName: key.serviceName,
          blocks,
        }),
      );
      const deliveryEncoded = yield* Schema.decodeUnknown(
        Schema.Union(
          Schema.Struct({
            _tag: Schema.Literal('Right'),
            right: Schema.Undefined,
          }),
          Schema.Struct({
            _tag: Schema.Literal('Left'),
            left: Schema.encodedSchema(ZerospinError.schema),
          }),
        ),
      )(deliveryUnknown).pipe(
        mapParseError({
          code: 'service-block-service-frontend-rpc-invalid',
          prefix: 'Failed to decode ServiceFrontendRepo delivery RPC',
        }),
      );
      yield* decodeRpc(deliveryEncoded);
      return lastBlock;
    }).pipe(Effect.retry(defaultRetrySchedule), Effect.either);

    if (Either.isLeft(delivery)) {
      // A second drain may have completed the same suffix while this remote
      // delivery was suspended. Never let the older failure overwrite that
      // newer acknowledgement with a stale terminal diagnostic.
      const latestSubscriber = db
        .select()
        .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
        .where(
          eq(
            serviceBlockDrizzleSchemas.serviceFrontendSubscribers
              .serviceFrontendRepoName,
            subscriber.serviceFrontendRepoName,
          ),
        )
        .get();
      if (
        latestSubscriber !== undefined &&
        (latestSubscriber.serviceName !== key.serviceName ||
          latestSubscriber.actorName !== serviceFrontendRepoKey.actorName ||
          latestSubscriber.actorId !== serviceFrontendRepoKey.actorId ||
          latestSubscriber.frontendName !== serviceFrontendRepoKey.frontendName)
      ) {
        return yield* new ZerospinError({
          code: 'service-block-service-frontend-repo-target-mismatch',
          message:
            'Stored service frontend subscriber target changed during delivery',
        });
      }
      if (
        latestSubscriber === undefined ||
        latestSubscriber.currentServiceCursor !==
          subscriber.currentServiceCursor ||
        latestSubscriber.currentServiceIndex !==
          subscriber.currentServiceIndex ||
        latestSubscriber.status !== subscriber.status ||
        latestSubscriber.catchupThroughServiceCursor !==
          subscriber.catchupThroughServiceCursor ||
        latestSubscriber.catchupThroughServiceIndex !==
          subscriber.catchupThroughServiceIndex
      ) {
        continue;
      }
      db.update(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
        .set({
          lastDeliveryError: delivery.left.message,
        })
        .where(
          eq(
            serviceBlockDrizzleSchemas.serviceFrontendSubscribers
              .serviceFrontendRepoName,
            subscriber.serviceFrontendRepoName,
          ),
        )
        .run();
      if (failFast) {
        return yield* delivery.left;
      }
      const subscriberRetryAt = Date.now() + 250;
      nextRetryAt =
        nextRetryAt === null
          ? subscriberRetryAt
          : Math.min(nextRetryAt, subscriberRetryAt);
      continue;
    }

    const reachedCatchupBound =
      subscriber.status === 'catching-up' &&
      delivery.right.serviceIndex === subscriber.catchupThroughServiceIndex;
    // The remote call above is the only suspension point after this snapshot.
    // Re-read every progress field before the synchronous SQL acknowledgement;
    // a concurrent drain may already have advanced this subscriber farther.
    const latestSubscriber = db
      .select()
      .from(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
      .where(
        eq(
          serviceBlockDrizzleSchemas.serviceFrontendSubscribers
            .serviceFrontendRepoName,
          subscriber.serviceFrontendRepoName,
        ),
      )
      .get();
    if (
      latestSubscriber !== undefined &&
      (latestSubscriber.serviceName !== key.serviceName ||
        latestSubscriber.actorName !== serviceFrontendRepoKey.actorName ||
        latestSubscriber.actorId !== serviceFrontendRepoKey.actorId ||
        latestSubscriber.frontendName !== serviceFrontendRepoKey.frontendName)
    ) {
      return yield* new ZerospinError({
        code: 'service-block-service-frontend-repo-target-mismatch',
        message:
          'Stored service frontend subscriber target changed during delivery',
      });
    }
    if (
      latestSubscriber === undefined ||
      latestSubscriber.currentServiceCursor !==
        subscriber.currentServiceCursor ||
      latestSubscriber.currentServiceIndex !== subscriber.currentServiceIndex ||
      latestSubscriber.status !== subscriber.status ||
      latestSubscriber.catchupThroughServiceCursor !==
        subscriber.catchupThroughServiceCursor ||
      latestSubscriber.catchupThroughServiceIndex !==
        subscriber.catchupThroughServiceIndex
    ) {
      continue;
    }
    db.update(serviceBlockDrizzleSchemas.serviceFrontendSubscribers)
      .set({
        currentServiceCursor: delivery.right.lastServiceCursor,
        currentServiceIndex: delivery.right.serviceIndex,
        status: reachedCatchupBound ? 'live' : subscriber.status,
        catchupThroughServiceCursor: reachedCatchupBound
          ? null
          : subscriber.catchupThroughServiceCursor,
        catchupThroughServiceIndex: reachedCatchupBound
          ? null
          : subscriber.catchupThroughServiceIndex,
        lastDeliveryError: null,
      })
      .where(
        eq(
          serviceBlockDrizzleSchemas.serviceFrontendSubscribers
            .serviceFrontendRepoName,
          subscriber.serviceFrontendRepoName,
        ),
      )
      .run();
  }

  return nextRetryAt;
});
