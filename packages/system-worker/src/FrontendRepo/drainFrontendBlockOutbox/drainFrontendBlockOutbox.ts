import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendLineageBlock } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
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
  configuredSystemId: string;
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
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.configuredSystemId).pipe(
    mapParseError({
      code: 'frontend-block-outbox-system-id-invalid',
      prefix: 'Failed to decode FrontendRepo configured systemId',
    }),
  );
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(key.generationId).pipe(
    mapParseError({
      code: 'frontend-block-outbox-generation-id-invalid',
      prefix: 'Failed to decode FrontendRepo generationId',
    }),
  );
  const accountId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.account),
  )(key.accountId).pipe(
    mapParseError({
      code: 'frontend-block-outbox-account-id-invalid',
      prefix: 'Failed to decode FrontendRepo accountId',
    }),
  );
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(key.actorId).pipe(
    mapParseError({
      code: 'frontend-block-outbox-actor-id-invalid',
      prefix: 'Failed to decode FrontendRepo actorId',
    }),
  );
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
  const blocks: IFrontendLineageBlock[] = [];
  for (const row of pendingRows) {
    const frontendBlock = yield* Schema.decodeUnknown(
      Schema.parseJson(FrontendBlockSchema),
    )(row.block).pipe(
      mapParseError({
        code: 'frontend-block-outbox-decode-failed',
        prefix: 'Failed to decode frontend block outbox row',
      }),
    );
    blocks.push({
      kind: 'frontend',
      systemId,
      generationId,
      accountId,
      accountName: key.accountName,
      actorId,
      actorName: key.actorName,
      frontendName: key.frontendName,
      frontendBlock,
    });
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
