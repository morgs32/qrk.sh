import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { ServiceFrontendLineageBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendLineageBlock } from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { desc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

/*
 * 1. Validate the complete target and canonicalize every proposed archive row.
 * 2. Append the whole request atomically in caller order.
 * 3. Accept an old index only when its canonical bytes are identical.
 * 4. Require every new index to be exactly terminal + 1.
 * 5. Broadcast only rows that committed for the first time.
 */
export const storeServiceFrontendBlocks = Effect.fn(
  'ServiceFrontendBlockRepo.storeServiceFrontendBlocks',
)(function* (props: {
  blocks: readonly IServiceFrontendLineageBlock[];
  db: IDb;
  key: {
    generationId: string;
    serviceName: string;
    actorName: string;
    actorId: string;
    frontendName: string;
  };
  broadcast: (message: string) => void;
}): Effect.fn.Return<void, IAnyError> {
  const { blocks, broadcast, db, key } = props;

  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(key.generationId).pipe(
    mapParseError({
      code: 'service-frontend-archive-generation-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo generationId',
    }),
  );
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(key.actorId).pipe(
    mapParseError({
      code: 'service-frontend-archive-actor-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo actorId',
    }),
  );

  // 1 — canonical bytes are computed before opening the synchronous SQL tx.
  const encodedBlocks: Array<{
    block: IServiceFrontendLineageBlock;
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
        code: 'service-frontend-archive-index-invalid',
        message: `Service frontend archive index must be a positive integer, received ${frontendIndex}`,
      });
    }
    if (
      block.generationId !== key.generationId ||
      block.serviceName !== key.serviceName ||
      block.actorName !== key.actorName ||
      block.actorId !== key.actorId ||
      block.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-target-mismatch',
        message:
          'Service frontend lineage block does not match its archive target',
        extra: {
          expected: key,
          received: {
            generationId: block.generationId,
            serviceName: block.serviceName,
            actorName: block.actorName,
            actorId: block.actorId,
            frontendName: block.frontendName,
          },
        },
      });
    }
    if (
      block.kind === 'service-frontend' &&
      (block.frontendBlock.serviceName !== key.serviceName ||
        block.frontendBlock.actorName !== key.actorName ||
        block.frontendBlock.actorId !== key.actorId ||
        block.frontendBlock.frontendName !== key.frontendName ||
        block.frontendBlock.frontendIndex !== frontendIndex)
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-archive-inner-target-mismatch',
        message:
          'Wrapped service frontend block does not match its lineage envelope',
      });
    }
    if (
      block.kind === 'generation-boundary' &&
      block.prevGenerationId === block.generationId
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-boundary-self-reference',
        message:
          'Service frontend generation boundary cannot reference its own generation as predecessor',
      });
    }
    const canonicalBytes = yield* Schema.encode(
      Schema.parseJson(ServiceFrontendLineageBlockSchema),
    )(block).pipe(
      mapParseError({
        code: 'service-frontend-lineage-block-encode-failed',
        prefix: `Failed to encode service frontend lineage block ${frontendIndex}`,
      }),
    );
    encodedBlocks.push({ block, canonicalBytes, frontendIndex });
  }

  // 2 — either every new row is contiguous and commits or no row commits.
  const insertedBlocks = yield* makeTx({
    db,
    program: Effect.fn(
      'ServiceFrontendBlockRepo.storeServiceFrontendBlocks.transaction',
    )(function* ({ tx }) {
      const lineage = tx
        .select()
        .from(serviceFrontendBlockDrizzleSchemas.lineage)
        .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
        .get();
      if (lineage === undefined) {
        return yield* new ZerospinError({
          code: 'service-frontend-lineage-not-configured',
          message:
            'ServiceFrontendBlockRepo must record immutable lineage before appending blocks',
        });
      }
      if (
        lineage.generationId !== key.generationId ||
        lineage.serviceName !== key.serviceName ||
        lineage.actorName !== key.actorName ||
        lineage.actorId !== actorId ||
        lineage.frontendName !== key.frontendName
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-lineage-target-mismatch',
          message:
            'ServiceFrontendBlockRepo stored lineage does not match its repository target',
        });
      }

      const terminalRow = tx
        .select({
          frontendIndex:
            serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
              .frontendIndex,
        })
        .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
        .orderBy(
          desc(
            serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
              .frontendIndex,
          ),
        )
        .limit(1)
        .get();
      let terminalFrontendIndex =
        terminalRow?.frontendIndex ??
        lineage.predecessorTerminalFrontendIndex ??
        0;
      const newlyInserted: IServiceFrontendLineageBlock[] = [];

      for (const encoded of encodedBlocks) {
        if (encoded.block.systemId !== lineage.systemId) {
          return yield* new ZerospinError({
            code: 'service-frontend-archive-system-mismatch',
            message:
              'Service frontend lineage block systemId does not match immutable lineage',
          });
        }
        const existing = tx
          .select({
            canonicalBytes:
              serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
                .canonicalBytes,
          })
          .from(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
          .where(
            eq(
              serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks
                .frontendIndex,
              encoded.frontendIndex,
            ),
          )
          .get();

        // 3 — exact encoded equality is the only duplicate success case.
        if (existing !== undefined) {
          if (existing.canonicalBytes === encoded.canonicalBytes) {
            continue;
          }
          return yield* new ZerospinError({
            code: 'service-frontend-archive-conflicting-duplicate',
            message: `Service frontend archive index ${encoded.frontendIndex} already exists with different canonical bytes`,
          });
        }

        // 4 — a missing or out-of-order index is corruption, never a skip.
        if (encoded.frontendIndex !== terminalFrontendIndex + 1) {
          return yield* new ZerospinError({
            code: 'service-frontend-archive-index-gap',
            message: `Service frontend archive expected index ${terminalFrontendIndex + 1}, received ${encoded.frontendIndex}`,
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
            code: 'service-frontend-boundary-required',
            message:
              'A successor ServiceFrontendBlockRepo must begin with its recorded generation boundary',
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
            code: 'service-frontend-boundary-predecessor-mismatch',
            message:
              'Service frontend generation boundary does not match the immutable predecessor descriptor',
          });
        }

        tx.insert(serviceFrontendBlockDrizzleSchemas.serviceFrontendBlocks)
          .values({
            frontendIndex: encoded.frontendIndex,
            systemId: encoded.block.systemId,
            generationId,
            serviceName: encoded.block.serviceName,
            actorName: encoded.block.actorName,
            actorId,
            frontendName: encoded.block.frontendName,
            kind: encoded.block.kind,
            canonicalBytes: encoded.canonicalBytes,
            lineageBlock: encoded.canonicalBytes,
          })
          .run();
        terminalFrontendIndex = encoded.frontendIndex;
        newlyInserted.push(encoded.block);
      }

      return newlyInserted;
    }),
  });

  // 5 — no client sees a block until its immutable row has committed.
  for (const block of insertedBlocks) {
    broadcast(JSON.stringify({ type: 'serviceFrontendBlock', sync: block }));
  }
});
