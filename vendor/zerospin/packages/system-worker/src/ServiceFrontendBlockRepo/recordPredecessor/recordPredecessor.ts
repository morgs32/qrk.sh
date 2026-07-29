import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { systemWorkerAbbreviations } from '../../systemWorkerAbbreviations.js';
import {
  serviceFrontendBlockDrizzleSchemas,
  ServiceFrontendBlockRepo,
} from '../ServiceFrontendBlockRepo.js';

/*
 * 1. Decode every persisted identity from the deterministic repository key.
 * 2. Accept either a complete predecessor triple or the explicit root case.
 * 3. Make the first descriptor immutable; only a byte-for-byte retry succeeds.
 */
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
    actorName: string;
    actorId: string;
    frontendName: string;
  };
  db: IDb;
}): Effect.fn.Return<void, IAnyError> {
  const { db, key, predecessor } = props;

  // 1 — malformed route or system identities never reach persisted lineage.
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
  )(key.generationId).pipe(
    mapParseError({
      code: 'service-frontend-lineage-generation-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo generationId',
    }),
  );
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(key.actorId).pipe(
    mapParseError({
      code: 'service-frontend-lineage-actor-id-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo actorId',
    }),
  );
  // 2 — a predecessor is one complete, exact pointer to the previous segment.
  const predecessorGenerationId =
    predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(coreAbbreviations.generation),
        )(predecessor.generationId).pipe(
          mapParseError({
            code: 'service-frontend-predecessor-generation-id-invalid',
            prefix:
              'Failed to decode ServiceFrontendBlockRepo predecessor generationId',
          }),
        );
  const predecessorRepoName =
    predecessor === null
      ? null
      : yield* Schema.decodeUnknown(
          makeAbbreviationIdSchema(
            systemWorkerAbbreviations.serviceFrontendBlockRepo,
          ),
        )(predecessor.repoName).pipe(
          mapParseError({
            code: 'service-frontend-predecessor-repo-name-invalid',
            prefix:
              'Failed to decode ServiceFrontendBlockRepo predecessor repoName',
          }),
        );
  if (predecessor !== null) {
    const predecessorRepoKey =
      yield* ServiceFrontendBlockRepo.repoUtils.nameUtils
        .parseName(predecessor.repoName)
        .pipe(
          Effect.mapError(
            error =>
              new ZerospinError({
                code: 'service-frontend-predecessor-repo-name-invalid',
                message:
                  'ServiceFrontendBlockRepo predecessor repoName must encode one exact service frontend archive target',
                cause: error.message,
              }),
          ),
        );
    if (
      !Number.isInteger(predecessor.terminalFrontendIndex) ||
      predecessor.terminalFrontendIndex < 0
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-predecessor-index-invalid',
        message: `ServiceFrontendBlockRepo predecessor terminal index must be a non-negative integer, received ${predecessor.terminalFrontendIndex}`,
      });
    }
    if (predecessorGenerationId === generationId) {
      return yield* new ZerospinError({
        code: 'service-frontend-predecessor-self-reference',
        message:
          'ServiceFrontendBlockRepo predecessor generation must differ from its generation',
      });
    }
    if (
      predecessorRepoKey.generationId !== predecessorGenerationId ||
      predecessorRepoKey.serviceName !== key.serviceName ||
      predecessorRepoKey.actorName !== key.actorName ||
      predecessorRepoKey.actorId !== actorId ||
      predecessorRepoKey.frontendName !== key.frontendName
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-predecessor-target-mismatch',
        message:
          'ServiceFrontendBlockRepo predecessor repoName does not encode the supplied predecessor generation and exact logical target',
      });
    }
  }
  const predecessorTerminalFrontendIndex =
    predecessor === null ? null : predecessor.terminalFrontendIndex;

  // 3 — retries may restate the exact descriptor, but cannot rewrite ancestry.
  const existing = db
    .select()
    .from(serviceFrontendBlockDrizzleSchemas.lineage)
    .where(eq(serviceFrontendBlockDrizzleSchemas.lineage.id, 'lineage'))
    .get();
  if (existing !== undefined) {
    if (
      existing.systemId === systemId &&
      existing.generationId === generationId &&
      existing.serviceName === key.serviceName &&
      existing.actorName === key.actorName &&
      existing.actorId === actorId &&
      existing.frontendName === key.frontendName &&
      existing.predecessorGenerationId === predecessorGenerationId &&
      existing.predecessorRepoName === predecessorRepoName &&
      existing.predecessorTerminalFrontendIndex ===
        predecessorTerminalFrontendIndex
    ) {
      return;
    }
    return yield* new ZerospinError({
      code: 'service-frontend-lineage-conflict',
      message:
        'ServiceFrontendBlockRepo lineage is immutable and does not match the stored descriptor',
    });
  }

  db.insert(serviceFrontendBlockDrizzleSchemas.lineage)
    .values({
      id: 'lineage',
      systemId,
      generationId,
      serviceName: key.serviceName,
      actorName: key.actorName,
      actorId,
      frontendName: key.frontendName,
      predecessorGenerationId,
      predecessorRepoName,
      predecessorTerminalFrontendIndex,
    })
    .run();
});
