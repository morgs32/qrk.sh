import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
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

import { ServiceBlockSchema } from '../../blockSchemas.js';
import { getServiceBlockRepo } from '../../ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo.js';
import { serviceRepoDrizzleSchemas } from '../ServiceRepo.js';

export const drainServiceBlockOutbox = Effect.fn(
  'ServiceRepo.drainServiceBlockOutbox',
)(function* (props: {
  db: IDb;
  storage: DurableObjectStorage;
  generationId: string;
  serviceName: string;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, generationId, serviceName, storage } = props;
  const pendingRows = db
    .select()
    .from(serviceRepoDrizzleSchemas.serviceBlockOutbox)
    .where(isNull(serviceRepoDrizzleSchemas.serviceBlockOutbox.publishedAt))
    .orderBy(asc(serviceRepoDrizzleSchemas.serviceBlockOutbox.serviceIndex))
    .all();

  for (const pendingRow of pendingRows) {
    const block = yield* Schema.decodeUnknown(
      Schema.parseJson(ServiceBlockSchema),
    )(pendingRow.block).pipe(
      mapParseError({
        code: 'service-block-outbox-decode-failed',
        prefix: 'Failed to decode service block outbox row',
      }),
    );
    const serviceBlockRepo = yield* getServiceBlockRepo({
      key: { generationId, serviceName },
    });
    const published = yield* makeAsync<
      Schema.EitherEncoded<void, IAnyErrorJson>
    >(() => serviceBlockRepo.publish(block)).pipe(
      Effect.flatMap(decodeRpc),
      Effect.as(true),
      Effect.catchAll(error =>
        Effect.sync(() => {
          db.update(serviceRepoDrizzleSchemas.serviceBlockOutbox)
            .set({ failure: ZerospinError.stringify(error) })
            .where(
              eq(
                serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
                pendingRow.lastServiceCursor,
              ),
            )
            .run();
          return false;
        }),
      ),
    );
    if (!published) {
      yield* Effect.promise(() => storage.setAlarm(Date.now() + 250));
      return;
    }
    db.update(serviceRepoDrizzleSchemas.serviceBlockOutbox)
      .set({ publishedAt: new Date(), failure: null })
      .where(
        eq(
          serviceRepoDrizzleSchemas.serviceBlockOutbox.lastServiceCursor,
          pendingRow.lastServiceCursor,
        ),
      )
      .run();
  }

  if (pendingRows.length > 0) {
    yield* Effect.promise(() => storage.deleteAlarm());
  }
});
