import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import { serviceFrontendBlockDrizzleSchemas } from '../ServiceFrontendBlockRepo.js';

export const recordPredecessor = Effect.fn(
  'ServiceFrontendBlockRepo.recordPredecessor',
)(function* (props: {
  systemId: string;
  predecessor: Readonly<{
    generationId: string;
    repoName: string;
    terminalFrontendIndex: number;
  }> | null;
  key: {
    generationId: string;
    serviceName: string;
    userId: string;
    frontendName: string;
  };
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.systemId).pipe(
    mapParseError({
      code: 'service-frontend-lineage-system-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo systemId',
    }),
  );
  const generationId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.generation),
  )(props.key.generationId).pipe(
    mapParseError({
      code: 'service-frontend-lineage-generation-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo generationId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.key.userId,
  ).pipe(
    mapParseError({
      code: 'service-frontend-lineage-user-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo userId',
    }),
  );
  const predecessorGenerationId =
    props.predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(coreAbbreviations.generation),
        )(props.predecessor.generationId).pipe(
          mapParseError({
            code: 'service-frontend-predecessor-generation-id-invalid',
            prefix:
              'Failed to decode ServiceFrontendBlockRepo predecessor generationId',
          }),
        );
  const predecessorRepoName =
    props.predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(
            systemWorkerAbbreviations.serviceFrontendBlockRepo,
          ),
        )(props.predecessor.repoName).pipe(
          mapParseError({
            code: 'service-frontend-predecessor-repo-name-invalid',
            prefix:
              'Failed to decode ServiceFrontendBlockRepo predecessor repoName',
          }),
        );
  if (
    props.predecessor !== null &&
    (!Number.isInteger(props.predecessor.terminalFrontendIndex) ||
      props.predecessor.terminalFrontendIndex < 0)
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-predecessor-index-invalid',
      message: `ServiceFrontendBlockRepo predecessor terminal index must be a non-negative integer, received ${props.predecessor.terminalFrontendIndex}`,
    });
  }
  if (predecessorGenerationId === generationId) {
    return yield* new ZerospinError({
      code: 'service-frontend-predecessor-self-reference',
      message:
        'ServiceFrontendBlockRepo predecessor generation must differ from its generation',
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
          .from(serviceFrontendBlockDrizzleSchemas.lineage)
          .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
          .get();
        if (existing !== undefined) {
          if (
            existing.systemId === systemId &&
            existing.generationId === generationId &&
            existing.serviceName === props.key.serviceName &&
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
            code: 'service-frontend-lineage-conflict',
            message:
              'ServiceFrontendBlockRepo immutable lineage already targets different state',
          });
        }
        tx.insert(serviceFrontendBlockDrizzleSchemas.lineage)
          .values({
            id: 'lineage',
            systemId,
            generationId,
            serviceName: props.key.serviceName,
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
            code: 'service-frontend-lineage-write-failed',
            message: 'Failed to persist ServiceFrontendBlockRepo lineage',
            cause: ZerospinError.prettyUnknownFailure(error),
          }),
  });
});
