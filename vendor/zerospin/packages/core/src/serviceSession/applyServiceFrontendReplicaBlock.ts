import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { makeTx } from '../drizzle/makeTx.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../serviceFrontendController/types.ts';

import { applyServiceFrontendBlock } from './applyServiceFrontendBlock.ts';
import { ServiceFrontendReplicaBlockSchema } from './ServiceFrontendBlockSchema.ts';
import type { IServiceFrontendReplicaBlock } from './types.ts';

/*
 * 1. Validate the complete replica envelope and prove equal-index duplicates.
 * 2. Validate nested lineage identity and index coherence before mutation.
 * 3. Apply an ordinary service delta or commit a data-free generation boundary.
 */
export const applyServiceFrontendReplicaBlock = Effect.fn(
  'applyServiceFrontendReplicaBlock',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  frontend: FRONTEND;
  actorId: IServiceFrontendReplicaBlock['actorId'];
  systemId: IServiceFrontendReplicaBlock['systemId'];
  generationId: string;
  currentFrontendIndex: number;
  currentReplicaIndex: number;
  previousReplicaBlock: IServiceFrontendReplicaBlock | null;
  db: IDb<IResourceDbConfig<FRONTEND['models'], Record<never, never>>>;
  models: FRONTEND['models'];
  frontendReplicaBlock: IServiceFrontendReplicaBlock;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  const {
    actorId,
    currentFrontendIndex,
    currentReplicaIndex,
    db,
    frontend,
    frontendReplicaBlock,
    generationId,
    models,
    previousReplicaBlock,
    systemId,
  } = props;

  const encodedReplicaBlock = yield* Schema.encode(
    ServiceFrontendReplicaBlockSchema,
  )(frontendReplicaBlock, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-frontend-replica-block-encode-failed',
      prefix: 'Failed to encode service frontend replica block',
    }),
  );

  if (
    frontendReplicaBlock.systemId !== systemId ||
    frontendReplicaBlock.generationId !== generationId ||
    frontendReplicaBlock.serviceName !== frontend.serviceName ||
    frontendReplicaBlock.actorId !== actorId ||
    frontendReplicaBlock.actorName !== frontend.actorName ||
    frontendReplicaBlock.frontendName !== frontend.frontendName ||
    frontendReplicaBlock.frontendVersion !== frontend.version
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-block-target-mismatch',
      message: 'Service frontend replica block does not match the bound target',
      extra: {
        expectedSystemId: systemId,
        expectedGenerationId: generationId,
        expectedServiceName: frontend.serviceName,
        expectedActorId: actorId,
        expectedActorName: frontend.actorName,
        expectedFrontendName: frontend.frontendName,
        expectedFrontendVersion: frontend.version,
        actualSystemId: frontendReplicaBlock.systemId,
        actualGenerationId: frontendReplicaBlock.generationId,
        actualServiceName: frontendReplicaBlock.serviceName,
        actualActorId: frontendReplicaBlock.actorId,
        actualActorName: frontendReplicaBlock.actorName,
        actualFrontendName: frontendReplicaBlock.frontendName,
        actualFrontendVersion: frontendReplicaBlock.frontendVersion,
      },
    });
  }

  if (frontendReplicaBlock.replicaIndex === currentReplicaIndex) {
    if (previousReplicaBlock === null) {
      return yield* new ZerospinError({
        code: 'service-frontend-replica-block-duplicate-proof-missing',
        message:
          'Equal-index service frontend replica block requires the previous block',
      });
    }
    const encodedPreviousReplicaBlock = yield* Schema.encode(
      ServiceFrontendReplicaBlockSchema,
    )(previousReplicaBlock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-frontend-previous-replica-block-encode-failed',
        prefix: 'Failed to encode previous service frontend replica block',
      }),
    );
    if (
      JSON.stringify(encodedReplicaBlock) ===
      JSON.stringify(encodedPreviousReplicaBlock)
    ) {
      return 'duplicate';
    }
    return yield* new ZerospinError({
      code: 'service-frontend-replica-block-conflicting-duplicate',
      message:
        'Equal-index service frontend replica blocks have different bytes',
      extra: { replicaIndex: frontendReplicaBlock.replicaIndex },
    });
  }

  if (frontendReplicaBlock.replicaIndex !== currentReplicaIndex + 1) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-block-index-gap',
      message:
        'Service frontend replica block is not the exact next replica index',
      extra: {
        currentReplicaIndex,
        receivedReplicaIndex: frontendReplicaBlock.replicaIndex,
      },
    });
  }

  const lineageBlock = frontendReplicaBlock.lineageBlock;
  const lineageFrontendIndex =
    lineageBlock.kind === 'generation-boundary'
      ? lineageBlock.frontendIndex
      : lineageBlock.frontendBlock.frontendIndex;
  if (
    lineageBlock.systemId !== systemId ||
    lineageBlock.serviceName !== frontend.serviceName ||
    lineageBlock.actorId !== actorId ||
    lineageBlock.actorName !== frontend.actorName ||
    lineageBlock.frontendName !== frontend.frontendName ||
    lineageFrontendIndex !== frontendReplicaBlock.frontendIndex ||
    frontendReplicaBlock.frontendIndex !== currentFrontendIndex + 1
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-lineage-target-mismatch',
      message:
        'Service frontend lineage block does not match its replica envelope',
    });
  }

  if (lineageBlock.kind === 'generation-boundary') {
    if (
      lineageBlock.prevGenerationId !== generationId ||
      lineageBlock.generationId === generationId
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-replica-generation-boundary-lineage-mismatch',
        message:
          'Service frontend generation boundary does not continue this replica',
      });
    }

    yield* makeTx({
      db,
      program: Effect.fn('applyServiceFrontendReplicaBlock.generationBoundary')(
        function* () {
          yield* Effect.void;
        },
      ),
    });
    return 'applied';
  }

  if (
    lineageBlock.generationId !== generationId ||
    lineageBlock.frontendBlock.serviceName !== frontend.serviceName ||
    lineageBlock.frontendBlock.actorId !== actorId ||
    lineageBlock.frontendBlock.actorName !== frontend.actorName ||
    lineageBlock.frontendBlock.frontendName !== frontend.frontendName ||
    lineageBlock.frontendBlock.frontendIndex !==
      frontendReplicaBlock.frontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-resource-lineage-mismatch',
      message:
        'Service frontend resource lineage block does not match this replica',
    });
  }

  yield* applyServiceFrontendBlock({
    frontend,
    actorId,
    currentFrontendIndex,
    db,
    models,
    frontendBlock: lineageBlock.frontendBlock,
  });
  return 'applied';
});
