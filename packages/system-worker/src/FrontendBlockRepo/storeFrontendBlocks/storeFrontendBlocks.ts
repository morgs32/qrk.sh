import type { IDb } from '@zerospin/core/drizzle/types';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendBlock } from '@zerospin/core/session/types';
import { mapParseError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

export const storeFrontendBlocks = Effect.fn(
  'FrontendBlockRepo.storeFrontendBlocks',
)(function* (props: {
  blocks: readonly IFrontendBlock[];
  db: IDb;
  broadcast: (message: string) => void;
}) {
  const { blocks, broadcast, db } = props;
  yield* Effect.void;
  for (const block of [...blocks].sort(
    (a, b) => a.frontendIndex - b.frontendIndex,
  )) {
    const existing = db
      .select({
        frontendIndex:
          frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
      })
      .from(frontendBlockDrizzleSchemas.frontendBlocks)
      .where(
        eq(
          frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
          block.frontendIndex,
        ),
      )
      .get();
    if (existing !== undefined) {
      continue;
    }
    const encodedBlock = yield* Schema.encode(
      Schema.parseJson(FrontendBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'frontend-block-encode-failed',
        prefix: 'Failed to encode frontend block',
      }),
    );
    db.insert(frontendBlockDrizzleSchemas.frontendBlocks)
      .values({ frontendIndex: block.frontendIndex, block: encodedBlock })
      .run();
    broadcast(JSON.stringify({ type: 'frontendBlock', sync: block }));
  }
});
