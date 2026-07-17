import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendBlock } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { getFrontendBlockRepo } from '../../FrontendBlockRepo/getFrontendBlockRepo/getFrontendBlockRepo.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

export const drainFrontendBlockOutbox = Effect.fn(
  'FrontendRepo.drainFrontendBlockOutbox',
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
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, key, storage } = props;
  const pendingRows = db
    .select()
    .from(frontendRepoDrizzleSchemas.frontendBlockOutbox)
    .where(isNull(frontendRepoDrizzleSchemas.frontendBlockOutbox.publishedAt))
    .orderBy(asc(frontendRepoDrizzleSchemas.frontendBlockOutbox.frontendIndex))
    .all();
  if (pendingRows.length === 0) {
    yield* Effect.promise(() => storage.deleteAlarm());
    return;
  }
  const frontendBlockRepo = yield* getFrontendBlockRepo({ key });
  const blocks: IFrontendBlock[] = [];
  for (const row of pendingRows) {
    blocks.push(
      yield* Schema.decodeUnknown(Schema.parseJson(FrontendBlockSchema))(
        row.block,
      ).pipe(
        mapParseError({
          code: 'frontend-block-outbox-decode-failed',
          prefix: 'Failed to decode frontend block outbox row',
        }),
      ),
    );
  }
  const delivered = yield* makeAsync<Schema.EitherEncoded<void, IAnyErrorJson>>(
    () =>
      frontendBlockRepo.storeFrontendBlocks({
        blocks,
      }),
  ).pipe(
    Effect.flatMap(decodeRpc),
    Effect.as(true),
    Effect.catchAll(error =>
      Effect.sync(() => {
        for (const row of pendingRows) {
          db.update(frontendRepoDrizzleSchemas.frontendBlockOutbox)
            .set({ failure: ZerospinError.stringify(error) })
            .where(
              eq(
                frontendRepoDrizzleSchemas.frontendBlockOutbox.frontendIndex,
                row.frontendIndex,
              ),
            )
            .run();
        }
        return false;
      }),
    ),
  );
  if (!delivered) {
    yield* Effect.promise(() => storage.setAlarm(Date.now() + 250));
    return;
  }
  for (const row of pendingRows) {
    db.update(frontendRepoDrizzleSchemas.frontendBlockOutbox)
      .set({ publishedAt: new Date(), failure: null })
      .where(
        eq(
          frontendRepoDrizzleSchemas.frontendBlockOutbox.frontendIndex,
          row.frontendIndex,
        ),
      )
      .run();
  }
  yield* Effect.promise(() => storage.deleteAlarm());
});
