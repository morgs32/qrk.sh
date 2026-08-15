import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { aggregateFrontendBlockDrizzleSchemas } from '../AggregateFrontendBlockRepo.js';

export const recordPredecessor = Effect.fn(
  'AggregateFrontendBlockRepo.recordPredecessor',
)(function* (props: {
  systemId: string;
  predecessor: Readonly<{
    generationId: string;
    repoName: string;
    terminalFrontendIndex: number;
  }> | null;
  key: {
    generationId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.systemId).pipe(
    mapParseError({
      code: 'aggregate-frontend-lineage-system-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo systemId',
    }),
  );
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(props.key.generationId).pipe(
    mapParseError({
      code: 'aggregate-frontend-lineage-generation-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo generationId',
    }),
  );
  const aggregateId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(props.key.aggregateId).pipe(
    mapParseError({
      code: 'aggregate-frontend-lineage-aggregate-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo aggregateId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.key.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-lineage-user-id-invalid',
      prefix: 'Failed to decode AggregateFrontendBlockRepo userId',
    }),
  );
  const predecessorGenerationId =
    props.predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(coreAbbreviations.generation),
        )(props.predecessor.generationId).pipe(
          mapParseError({
            code: 'aggregate-frontend-predecessor-generation-id-invalid',
            prefix:
              'Failed to decode AggregateFrontendBlockRepo predecessor generationId',
          }),
        );
  const predecessorRepoName =
    props.predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(
            systemWorkerAbbreviations.aggregateFrontendBlockRepo,
          ),
        )(props.predecessor.repoName).pipe(
          mapParseError({
            code: 'aggregate-frontend-predecessor-repo-name-invalid',
            prefix:
              'Failed to decode AggregateFrontendBlockRepo predecessor repoName',
          }),
        );
  if (
    props.predecessor !== null &&
    (!Number.isInteger(props.predecessor.terminalFrontendIndex) ||
      props.predecessor.terminalFrontendIndex < 0)
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-predecessor-index-invalid',
      message: `AggregateFrontendBlockRepo predecessor terminal index must be a non-negative integer, received ${props.predecessor.terminalFrontendIndex}`,
    });
  }
  if (predecessorGenerationId === generationId) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-predecessor-self-reference',
      message:
        'AggregateFrontendBlockRepo predecessor generation must differ from its generation',
    });
  }
  const predecessorTerminalFrontendIndex =
    props.predecessor?.terminalFrontendIndex ?? null;
  const replayFloorFrontendIndex =
    props.predecessor?.terminalFrontendIndex ?? 0;

  yield* Effect.try({
    try: () =>
      props.db.transaction(tx => {
        const existing = tx
          .select()
          .from(aggregateFrontendBlockDrizzleSchemas.lineage)
          .where(eq(aggregateFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
          .get();
        if (existing !== undefined) {
          if (
            existing.systemId === systemId &&
            existing.generationId === generationId &&
            existing.aggregateId === aggregateId &&
            existing.aggregateName === props.key.aggregateName &&
            existing.userId === userId &&
            existing.frontendName === props.key.frontendName &&
            existing.predecessorGenerationId === predecessorGenerationId &&
            existing.predecessorRepoName === predecessorRepoName &&
            existing.predecessorTerminalFrontendIndex ===
              predecessorTerminalFrontendIndex &&
            existing.replayFloorFrontendIndex === replayFloorFrontendIndex
          ) {
            return;
          }
          throw new ZerospinError({
            code: 'aggregate-frontend-lineage-conflict',
            message:
              'AggregateFrontendBlockRepo immutable lineage already targets different state',
          });
        }
        tx.insert(aggregateFrontendBlockDrizzleSchemas.lineage)
          .values({
            id: 'lineage',
            systemId,
            generationId,
            aggregateId,
            aggregateName: props.key.aggregateName,
            userId,
            frontendName: props.key.frontendName,
            predecessorGenerationId,
            predecessorRepoName,
            predecessorTerminalFrontendIndex,
            replayFloorFrontendIndex,
          })
          .run();
      }),
    catch: error =>
      ZerospinError.isZerospinError(error)
        ? error
        : new ZerospinError({
            code: 'aggregate-frontend-lineage-write-failed',
            message: 'Failed to persist AggregateFrontendBlockRepo lineage',
            cause: ZerospinError.prettyUnknownFailure(error),
          }),
  });
});
