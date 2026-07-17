import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError } from '@zerospin/error';
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
