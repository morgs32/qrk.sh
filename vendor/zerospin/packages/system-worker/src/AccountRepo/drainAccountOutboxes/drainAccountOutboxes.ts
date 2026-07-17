import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedExecutedAccountCommandSchema,
  EncodedFailedAccountCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import type { IAccountBlock } from '../../types.js';
import { accountRepoDrizzleSchemas } from '../AccountRepo.js';
import { publishAccountBlock } from '../finalizeAccountBlock/publishAccountBlock.js';
import { upsertAccountBlock } from '../finalizeAccountBlock/upsertAccountBlock.js';

export const drainAccountOutboxes = Effect.fn(
  'AccountRepo.drainAccountOutboxes',
)(function* (props: {
  accountRepoName: string;
  generationId: string;
  accountId: string;
  accountName: string;
  db: IDb;
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const {
    accountId,
    accountName,
    accountRepoName,
    db,
    generationId,
    storage,
  } = props;
  let needsAlarm = false;

  const pendingSubscriptions = db
    .select()
    .from(accountRepoDrizzleSchemas.serviceSubscriptions)
    .where(isNull(accountRepoDrizzleSchemas.serviceSubscriptions.subscribedAt))
    .all();
  for (const subscription of pendingSubscriptions) {
    const serviceBlockRepo = yield* getServiceBlockRepo({
      key: {
        generationId,
        serviceName: subscription.serviceName,
      },
    });
    const subscribed = yield* makeAsync<
      Schema.EitherEncoded<void, IAnyErrorJson>
    >(() =>
      serviceBlockRepo.subscribeAccount({
        accountRepoName,
        accountId,
        accountName,
        currentServiceCursor: subscription.currentServiceCursor,
        currentServiceIndex: subscription.currentServiceIndex,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.as(true),
      Effect.catchAll(error =>
        Effect.sync(() => {
          db.update(accountRepoDrizzleSchemas.serviceSubscriptions)
            .set({ failure: ZerospinError.stringify(error) })
            .where(
              eq(
                accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
                subscription.serviceRepoName,
              ),
            )
            .run();
          return false;
        }),
      ),
    );
    if (!subscribed) {
      needsAlarm = true;
      continue;
    }
    db.update(accountRepoDrizzleSchemas.serviceSubscriptions)
      .set({ subscribedAt: new Date(), failure: null })
      .where(
        eq(
          accountRepoDrizzleSchemas.serviceSubscriptions.serviceRepoName,
          subscription.serviceRepoName,
        ),
      )
      .run();
  }

  const pendingBlocks = db
    .select()
    .from(accountRepoDrizzleSchemas.accountBlockOutbox)
    .where(isNull(accountRepoDrizzleSchemas.accountBlockOutbox.publishedAt))
    .orderBy(asc(accountRepoDrizzleSchemas.accountBlockOutbox.accountIndex))
    .all();
  for (const row of pendingBlocks) {
    const executedCommands = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedExecutedAccountCommandSchema,
            ExecutedPushedCommandSchema,
          ),
        ),
      ),
    )(row.executedCommands).pipe(
      mapParseError({
        code: 'account-block-outbox-executed-commands-decode-failed',
        prefix: 'Failed to decode AccountRepo outbox executed commands',
      }),
    );
    const failedCommands = yield* Schema.decodeUnknown(
      Schema.parseJson(
        Schema.Array(
          Schema.Union(
            EncodedFailedAccountCommandSchema,
            FailedPushedCommandSchema,
          ),
        ),
      ),
    )(row.failedCommands).pipe(
      mapParseError({
        code: 'account-block-outbox-failed-commands-decode-failed',
        prefix: 'Failed to decode AccountRepo outbox failed commands',
      }),
    );
    const appliedMutations = yield* Schema.decodeUnknown(
      Schema.parseJson(Schema.Array(EncodedAppliedMutationSchema)),
    )(row.appliedMutations).pipe(
      mapParseError({
        code: 'account-block-outbox-applied-mutations-decode-failed',
        prefix: 'Failed to decode AccountRepo outbox applied mutations',
      }),
    );
    const accountBlock = {
      pushedBlockId: row.pushedBlockId,
      lastAccountCursor: row.lastAccountCursor,
      accountIndex: row.accountIndex,
      executedCommands,
      failedCommands,
      appliedMutations,
    } satisfies IAccountBlock;
    const published = yield* publishAccountBlock({
      generationId,
      accountId,
      accountName,
      accountBlock,
    });
    yield* upsertAccountBlock({ accountBlock: published, db });
    if (published.failure !== null) {
      needsAlarm = true;
      break;
    }
  }

  if (needsAlarm) {
    yield* Effect.promise(() => storage.setAlarm(Date.now() + 250));
  } else {
    yield* Effect.promise(() => storage.deleteAlarm());
  }
});
