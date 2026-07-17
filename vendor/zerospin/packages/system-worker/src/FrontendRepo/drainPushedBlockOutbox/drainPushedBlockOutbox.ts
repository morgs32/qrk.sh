/*
 * Delivers FrontendRepo pushed blocks to AccountRepo in pushed-cursor order.
 * Each block gets three total attempts. A terminal delivery failure is stored
 * on that row and stops this drain so later blocks cannot overtake it.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PushedBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import { dutils } from '@zerospin/core/utils/dutils';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  makeTraceableRpcTarget,
} from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { getAccountRepo } from '../../AccountRepo/getAccountRepo/getAccountRepo.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

export const drainPushedBlockOutbox = Effect.fn(
  'FrontendRepo.drainPushedBlockOutbox',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
  };
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, key } = props;
  const pendingRows = db
    .select()
    .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
    .where(isNull(frontendRepoDrizzleSchemas.pushedBlockOutbox.finalizedAt))
    .orderBy(
      asc(frontendRepoDrizzleSchemas.pushedBlockOutbox.firstPushedCursor),
    )
    .all();
  if (pendingRows.length === 0) {
    return;
  }

  const accountRepo = yield* getAccountRepo({
    key: {
      generationId: key.generationId,
      accountId: key.accountId,
      accountName: key.accountName,
    },
  });
  const tracedAccountRepo = makeTraceableRpcTarget(accountRepo);

  for (const row of pendingRows) {
    const pushedBlock = yield* Schema.decodeUnknown(
      Schema.parseJson(PushedBlockSchema),
    )(row.block).pipe(
      mapParseError({
        code: 'frontend-pushed-block-outbox-decode-failed',
        prefix: `Failed to decode pushed block outbox row "${row.id}"`,
      }),
    );
    const collector = makeTelemetryCollector();
    const delivered = yield* tracedAccountRepo
      .finalizePushedCommands({ pushedBlock })
      .pipe(
        Effect.mapError(error =>
          error instanceof Error
            ? new ZerospinError({
                code: 'pushed-account-finalization-rpc-failed',
                message: error.message,
                cause: ZerospinError.prettyUnknownFailure(error),
              })
            : Schema.decodeUnknownSync(ZerospinError.schema)(error),
        ),
        Effect.asVoid,
        Effect.retry({
          schedule: defaultRetrySchedule,
        }),
        Effect.either,
        Effect.provide(makeTelemetryLayer(collector)),
      );

    const batch = collector.flush();
    yield* Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
        key: { generationId: key.generationId },
      });
      const encoded = yield* makeAsync(() =>
        systemLogRepo.appendTelemetryBatch({
          batch,
          deployId: env.ZEROSPIN_DEPLOY_ID,
        }),
      );
      yield* decodeRpc(encoded);
    }).pipe(Effect.catchAll(() => Effect.void));

    if (Either.isLeft(delivered)) {
      db.update(frontendRepoDrizzleSchemas.pushedBlockOutbox)
        .set({ failure: ZerospinError.stringify(delivered.left) })
        .where(
          and(
            eq(frontendRepoDrizzleSchemas.pushedBlockOutbox.id, row.id),
            isNull(frontendRepoDrizzleSchemas.pushedBlockOutbox.finalizedAt),
          ),
        )
        .run();
      return;
    }

    db.update(frontendRepoDrizzleSchemas.pushedBlockOutbox)
      .set({
        finalizedAt: yield* dutils.date(),
        failure: null,
      })
      .where(eq(frontendRepoDrizzleSchemas.pushedBlockOutbox.id, row.id))
      .run();
  }
});
