import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { FrontendLineageBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendLineageBlock } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { frontendBlockDrizzleSchemas } from '../FrontendBlockRepo.js';

/*
 * 1. Validate the complete target and canonicalize every proposed archive row.
 * 2. Append the whole request atomically in caller order.
 * 3. Accept an old index only when its canonical bytes are identical.
 * 4. Require every new index to be exactly terminal + 1.
 * 5. Broadcast only rows that committed for the first time.
 */
export const storeFrontendBlocks = Effect.fn(
  'FrontendBlockRepo.storeFrontendBlocks',
)(function* (props: {
  blocks: readonly IFrontendLineageBlock[];
  db: IDb;
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
  broadcast: (message: string) => void;
}): Effect.fn.Return<void, IAnyError> {
  const { blocks, broadcast, db, key } = props;

  yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(key.generationId).pipe(
    mapParseError({
      code: 'frontend-archive-generation-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo generationId',
    }),
  );
  const accountId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.account),
  )(key.accountId).pipe(
    mapParseError({
      code: 'frontend-archive-account-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo accountId',
    }),
  );
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(key.actorId).pipe(
    mapParseError({
      code: 'frontend-archive-actor-id-invalid',
      prefix: 'Failed to decode FrontendBlockRepo actorId',
    }),
  );

  // 1 — canonical bytes are computed before the synchronous SQL transaction.
  const encodedBlocks: Array<{
    block: IFrontendLineageBlock;
    canonicalBytes: string;
    frontendIndex: number;
  }> = [];
  for (const block of blocks) {
    const frontendIndex =
      block.kind === 'generation-boundary'
        ? block.frontendIndex
        : block.frontendBlock.frontendIndex;
    if (!Number.isInteger(frontendIndex) || frontendIndex < 1) {
      return yield* new ZerospinError({
        code: 'frontend-archive-index-invalid',
        message: `Frontend archive index must be a positive integer, received ${frontendIndex}`,
      });
    }
    if (
      block.generationId !== key.generationId ||
      block.accountId !== key.accountId ||
      block.accountName !== key.accountName ||
      block.actorName !== key.actorName ||
      block.actorId !== key.actorId ||
      block.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'frontend-archive-target-mismatch',
        message: 'Frontend lineage block does not match its archive target',
        extra: {
          expected: key,
          received: {
            generationId: block.generationId,
            accountId: block.accountId,
            accountName: block.accountName,
            actorName: block.actorName,
            actorId: block.actorId,
            frontendName: block.frontendName,
          },
        },
      });
    }
    if (
      block.kind === 'frontend' &&
      (block.frontendBlock.frontendName !== key.frontendName ||
        block.frontendBlock.frontendIndex !== frontendIndex)
    ) {
      return yield* new ZerospinError({
        code: 'frontend-archive-inner-target-mismatch',
        message: 'Wrapped frontend block does not match its lineage envelope',
      });
    }
    if (
      block.kind === 'generation-boundary' &&
      block.prevGenerationId === block.generationId
    ) {
      return yield* new ZerospinError({
        code: 'frontend-boundary-self-reference',
        message:
          'Frontend generation boundary cannot reference its own generation as predecessor',
      });
    }
    const canonicalBytes = yield* Schema.encode(
      Schema.parseJson(FrontendLineageBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'frontend-lineage-block-encode-failed',
        prefix: `Failed to encode frontend lineage block ${frontendIndex}`,
      }),
    );
    encodedBlocks.push({ block, canonicalBytes, frontendIndex });
  }

  // 2 — every new row is contiguous and commits together, or none commits.
  const insertedBlocks = yield* makeTx({
    db,
    program: Effect.fn('FrontendBlockRepo.storeFrontendBlocks.transaction')(
      function* ({ tx }) {
        const lineage = tx
          .select()
          .from(frontendBlockDrizzleSchemas.lineage)
          .where(eq(frontendBlockDrizzleSchemas.lineage.id, 'lineage'))
          .get();
        if (lineage === undefined) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-not-configured',
            message:
              'FrontendBlockRepo must record immutable lineage before appending blocks',
          });
        }
        if (
          lineage.generationId !== key.generationId ||
          lineage.accountId !== accountId ||
          lineage.accountName !== key.accountName ||
          lineage.actorName !== key.actorName ||
          lineage.actorId !== actorId ||
          lineage.frontendName !== key.frontendName
        ) {
          return yield* new ZerospinError({
            code: 'frontend-lineage-target-mismatch',
            message:
              'FrontendBlockRepo stored lineage does not match its repository target',
          });
        }

        const terminalRow = tx
          .select({
            frontendIndex:
              frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
          })
          .from(frontendBlockDrizzleSchemas.frontendBlocks)
          .orderBy(
            desc(frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex),
          )
          .limit(1)
          .get();
        let terminalFrontendIndex =
          terminalRow?.frontendIndex ??
          lineage.predecessorTerminalFrontendIndex ??
          0;
        const newlyInserted: IFrontendLineageBlock[] = [];

        for (const encoded of encodedBlocks) {
          if (encoded.block.systemId !== lineage.systemId) {
            return yield* new ZerospinError({
              code: 'frontend-archive-system-mismatch',
              message:
                'Frontend lineage block systemId does not match immutable lineage',
            });
          }
          const existing = tx
            .select({
              canonicalBytes:
                frontendBlockDrizzleSchemas.frontendBlocks.canonicalBytes,
            })
            .from(frontendBlockDrizzleSchemas.frontendBlocks)
            .where(
              eq(
                frontendBlockDrizzleSchemas.frontendBlocks.frontendIndex,
                encoded.frontendIndex,
              ),
            )
            .get();

          // 3 — exact canonical equality is the only duplicate success case.
          if (existing !== undefined) {
            if (existing.canonicalBytes === encoded.canonicalBytes) {
              continue;
            }
            return yield* new ZerospinError({
              code: 'frontend-archive-conflicting-duplicate',
              message: `Frontend archive index ${encoded.frontendIndex} already exists with different canonical bytes`,
            });
          }

          // 4 — gaps and out-of-order appends are corruption, never skips.
          if (encoded.frontendIndex !== terminalFrontendIndex + 1) {
            return yield* new ZerospinError({
              code: 'frontend-archive-index-gap',
              message: `Frontend archive expected index ${terminalFrontendIndex + 1}, received ${encoded.frontendIndex}`,
              extra: {
                terminalFrontendIndex,
                receivedFrontendIndex: encoded.frontendIndex,
              },
            });
          }
          if (
            terminalFrontendIndex ===
              (lineage.predecessorTerminalFrontendIndex ?? 0) &&
            lineage.predecessorGenerationId !== null &&
            (lineage.predecessorTerminalFrontendIndex === null ||
              encoded.block.kind !== 'generation-boundary' ||
              encoded.block.prevGenerationId !==
                lineage.predecessorGenerationId ||
              encoded.frontendIndex !==
                lineage.predecessorTerminalFrontendIndex + 1)
          ) {
            return yield* new ZerospinError({
              code: 'frontend-boundary-required',
              message:
                'A successor FrontendBlockRepo must begin with its recorded generation boundary',
            });
          }
          if (
            encoded.block.kind === 'generation-boundary' &&
            (lineage.predecessorGenerationId === null ||
              encoded.block.prevGenerationId !==
                lineage.predecessorGenerationId ||
              lineage.predecessorTerminalFrontendIndex === null ||
              encoded.frontendIndex !==
                lineage.predecessorTerminalFrontendIndex + 1)
          ) {
            return yield* new ZerospinError({
              code: 'frontend-boundary-predecessor-mismatch',
              message:
                'Frontend generation boundary does not match the immutable predecessor descriptor',
            });
          }

          tx.insert(frontendBlockDrizzleSchemas.frontendBlocks)
            .values({
              frontendIndex: encoded.frontendIndex,
              canonicalBytes: encoded.canonicalBytes,
              lineageBlock: encoded.canonicalBytes,
            })
            .run();
          terminalFrontendIndex = encoded.frontendIndex;
          newlyInserted.push(encoded.block);
        }

        return newlyInserted;
      },
    ),
  });

  // 5 — no client sees a row until the immutable archive commit has succeeded.
  for (const block of insertedBlocks) {
    broadcast(JSON.stringify({ type: 'frontendBlock', sync: block }));
  }
});
