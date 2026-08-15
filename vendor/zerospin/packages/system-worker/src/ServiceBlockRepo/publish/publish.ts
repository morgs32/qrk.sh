import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ServiceBlockSchema } from '../../blockSchemas.js';
import type { IServiceBlock } from '../../types.js';
import { serviceBlockDrizzleSchemas } from '../ServiceBlockRepo.js';

export const publish = Effect.fn('ServiceBlockRepo.publish')(function* (props: {
  block: IServiceBlock;
  db: IDb;
}) {
  const { block, db } = props;
  const encodedBlock = yield* Schema.encode(
    Schema.parseJson(ServiceBlockSchema),
  )(block).pipe(
    mapParseError({
      code: 'service-block-encode-failed',
      prefix: 'Failed to encode service block',
    }),
  );
  const retained = db
    .select()
    .from(serviceBlockDrizzleSchemas.serviceBlocks)
    .where(
      or(
        eq(
          serviceBlockDrizzleSchemas.serviceBlocks.serviceIndex,
          block.serviceIndex,
        ),
        eq(
          serviceBlockDrizzleSchemas.serviceBlocks.lastServiceCursor,
          block.lastServiceCursor,
        ),
      ),
    )
    .get();
  if (retained !== undefined) {
    if (
      retained.lastServiceCursor !== block.lastServiceCursor ||
      retained.serviceIndex !== block.serviceIndex ||
      retained.block !== encodedBlock
    ) {
      return yield* new ZerospinError({
        code: 'service-block-publish-conflict',
        message: `Service block ${block.serviceIndex} conflicts with its retained ledger bytes`,
      });
    }
    return;
  }
  yield* makeTx({
    db,
    program: Effect.fn('ServiceBlockRepo.publish.transaction')(function* ({
      tx,
    }) {
      yield* Effect.void;
      tx.insert(serviceBlockDrizzleSchemas.serviceBlocks)
        .values({
          lastServiceCursor: block.lastServiceCursor,
          serviceIndex: block.serviceIndex,
          block: encodedBlock,
        })
        .onConflictDoNothing()
        .run();
    }),
  });
});
