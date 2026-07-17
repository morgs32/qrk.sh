import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IServiceCursorId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { ServiceRepo } from '../../ServiceRepo/ServiceRepo.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';

/** Restores both sides of one replayed service subscription at its exact watermark. */
export const restoreReplaySubscription = Effect.fn(
  'AccountRepo.restoreReplaySubscription',
)(function* (props: {
  accountId: string;
  accountName: string;
  accountRepoName: string;
  currentServiceCursor: IServiceCursorId;
  currentServiceIndex: number;
  db: IDb;
  generationId: string;
  serviceName: string;
}): Effect.fn.Return<
  Readonly<{
    restored: boolean;
    serviceRepoName: string;
    serviceName: string;
    currentServiceCursor: IServiceCursorId;
    currentServiceIndex: number;
  }>,
  IAnyError,
  Async
> {
  const {
    accountId,
    accountName,
    accountRepoName,
    currentServiceCursor,
    currentServiceIndex,
    db,
    generationId,
    serviceName,
  } = props;

  // 1 — the target generation, never the copied source name, determines repo identity.
  const serviceRepoName = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.serviceRepo),
  )(
    yield* ServiceRepo.repoUtils.nameUtils.makeName({
      generationId,
      serviceName,
    }),
  ).pipe(
    mapParseError({
      code: 'account-replay-service-repo-name-invalid',
      prefix: 'Failed to decode the target replay ServiceRepo name',
    }),
  );
  const existing = db
    .select()
    .from(accountRepoDrizzleSchemas.serviceSubscriptions)
    .where(
      eq(
        accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
        serviceRepoName,
      ),
    )
    .get();

  // 2 — retry is idempotent only when the stored membership and watermark match exactly.
  if (
    existing !== undefined &&
    (existing.serviceName !== serviceName ||
      existing.currentServiceCursor !== currentServiceCursor ||
      existing.currentServiceIndex !== currentServiceIndex)
  ) {
    return yield* new ZerospinError({
      code: 'account-replay-subscription-receipt-mismatch',
      message: `AccountRepo target subscription "${serviceRepoName}" does not match the requested replay watermark`,
    });
  }
  if (
    existing !== undefined &&
    existing.subscribedAt !== null &&
    existing.failure === null
  ) {
    return {
      restored: false,
      serviceRepoName,
      serviceName,
      currentServiceCursor,
      currentServiceIndex,
    };
  }

  // 3 — persist the AccountRepo side as pending before making the remote subscription.
  if (existing === undefined) {
    db.insert(accountRepoDrizzleSchemas.serviceSubscriptions)
      .values({
        serviceRepoName,
        serviceName,
        currentServiceCursor,
        currentServiceIndex,
        subscribedAt: null,
        failure: null,
      })
      .run();
  }

  // 4 — ServiceBlockRepo upserts the exact target account and source watermark.
  const serviceBlockRepo = yield* getServiceBlockRepo({
    key: { generationId, serviceName },
  });
  const subscribed = yield* makeAsync<
    Schema.EitherEncoded<void, IAnyErrorJson>
  >(() =>
    serviceBlockRepo.subscribeAccount({
      accountRepoName,
      accountId,
      accountName,
      currentServiceCursor,
      currentServiceIndex,
    }),
  ).pipe(Effect.flatMap(decodeRpc), Effect.either);
  if (subscribed._tag === 'Left') {
    db.update(accountRepoDrizzleSchemas.serviceSubscriptions)
      .set({ failure: ZerospinError.stringify(subscribed.left) })
      .where(
        eq(
          accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
          serviceRepoName,
        ),
      )
      .run();
    return yield* subscribed.left;
  }

  // 5 — activation is the final local write; future service blocks may fan out now.
  db.update(accountRepoDrizzleSchemas.serviceSubscriptions)
    .set({ subscribedAt: new Date(), failure: null })
    .where(
      eq(
        accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
        serviceRepoName,
      ),
    )
    .run();

  return {
    restored: true,
    serviceRepoName,
    serviceName,
    currentServiceCursor,
    currentServiceIndex,
  };
});
