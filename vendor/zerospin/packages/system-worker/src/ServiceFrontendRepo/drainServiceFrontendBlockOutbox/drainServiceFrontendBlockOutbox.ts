import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendLineageBlock } from '@zerospin/core/serviceSession/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';

import { getServiceFrontendBlockRepo } from '../../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { serviceFrontendRepoDrizzleSchemas } from '../ServiceFrontendRepo.js';

/* The upstream ServiceBlock subscriber is acknowledged only after this archive append succeeds. */
export const drainServiceFrontendBlockOutbox = Effect.fn(
  'ServiceFrontendRepo.drainServiceFrontendBlockOutbox',
)(function* (props: {
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, key, storage } = props;
  const pendingRows = db
    .select()
    .from(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
    .where(
      isNull(
        serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
          .publishedAt,
      ),
    )
    .orderBy(
      asc(
        serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
          .frontendIndex,
      ),
    )
    .all();
  if (pendingRows.length === 0) {
    yield* Effect.promise(() => storage.deleteAlarm());
    return;
  }

  const state = db
    .select()
    .from(serviceFrontendRepoDrizzleSchemas.projectionState)
    .where(eq(serviceFrontendRepoDrizzleSchemas.projectionState.id, 'state'))
    .get();
  if (state === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-projection-state-required',
      message:
        'ServiceFrontendRepo cannot publish an outbox without projection state',
    });
  }

  const lineageBlocks: IServiceFrontendLineageBlock[] = [];
  for (const row of pendingRows) {
    const frontendBlock = yield* Schema.decodeUnknown(
      Schema.parseJson(ServiceFrontendBlockSchema),
    )(row.block).pipe(
      mapParseError({
        code: 'service-frontend-outbox-block-invalid',
        prefix: `Failed to decode service frontend outbox index ${row.frontendIndex}`,
      }),
    );
    if (
      frontendBlock.frontendIndex !== row.frontendIndex ||
      frontendBlock.serviceName !== key.serviceName ||
      frontendBlock.actorName !== key.actorName ||
      frontendBlock.actorId !== key.actorId ||
      frontendBlock.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-outbox-target-mismatch',
        message: `Service frontend outbox index ${row.frontendIndex} does not match its projection target`,
      });
    }
    lineageBlocks.push({
      kind: 'service-frontend',
      systemId: state.systemId,
      generationId: state.generationId,
      serviceName: state.serviceName,
      actorId: state.actorId,
      actorName: state.actorName,
      frontendName: state.frontendName,
      frontendBlock,
    });
  }

  const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({ key });
  const deliveredUnknown = yield* makeAsync(() =>
    serviceFrontendBlockRepo.storeServiceFrontendBlocks({
      blocks: lineageBlocks,
    }),
  );
  const deliveredEncoded = yield* Schema.decodeUnknown(
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
  )(deliveredUnknown).pipe(
    mapParseError({
      code: 'service-frontend-archive-store-rpc-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo store RPC',
    }),
  );
  const delivered = yield* decodeRpc(deliveredEncoded).pipe(Effect.either);
  if (Either.isLeft(delivered)) {
    for (const row of pendingRows) {
      db.update(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
        .set({ failure: ZerospinError.stringify(delivered.left) })
        .where(
          eq(
            serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
              .frontendIndex,
            row.frontendIndex,
          ),
        )
        .run();
    }
    yield* Effect.promise(() => storage.setAlarm(Date.now() + 250));
    return yield* delivered.left;
  }

  for (const row of pendingRows) {
    db.update(serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox)
      .set({ publishedAt: new Date(), failure: null })
      .where(
        eq(
          serviceFrontendRepoDrizzleSchemas.serviceFrontendBlockOutbox
            .frontendIndex,
          row.frontendIndex,
        ),
      )
      .run();
  }
  yield* Effect.promise(() => storage.deleteAlarm());
});
