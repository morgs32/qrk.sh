import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IServiceFrontendController } from '../frontendController/types.ts';

import { applyServiceFrontendBlock } from './applyServiceFrontendBlock.ts';
import { ServiceFrontendReplicaBlockSchema } from './ServiceFrontendBlockSchema.ts';
import type { IServiceFrontendReplicaBlock } from './types.ts';

/*
 * 1. Validate the complete replica envelope and prove equal-index duplicates.
 * 2. Reject the wrong lock key before local mutation.
 * 3. Validate the ordinary nested block and its index coherence.
 */
export const applyServiceFrontendReplicaBlock = Effect.fn(
  'applyServiceFrontendReplicaBlock',
)(function* <FRONTEND extends IServiceFrontendController>(props: {
  frontend: FRONTEND;
  userId: IServiceFrontendReplicaBlock['userId'];
  systemId: IServiceFrontendReplicaBlock['systemId'];
  serviceFrontendLockKey: string;
  currentFrontendIndex: number;
  currentReplicaIndex: number;
  previousReplicaBlock: IServiceFrontendReplicaBlock | null;
  db: IDb<IResourceDbConfig<FRONTEND['models'], Record<never, never>>>;
  models: FRONTEND['models'];
  frontendReplicaBlock: IServiceFrontendReplicaBlock;
}): Effect.fn.Return<'applied' | 'duplicate', IAnyError> {
  const {
    userId,
    currentFrontendIndex,
    currentReplicaIndex,
    db,
    frontend,
    frontendReplicaBlock,
    models,
    previousReplicaBlock,
    systemId,
    serviceFrontendLockKey,
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
    frontendReplicaBlock.serviceName !== frontend.serviceName ||
    frontendReplicaBlock.userId !== userId ||
    frontendReplicaBlock.frontendName !== frontend.frontendName ||
    frontendReplicaBlock.serviceFrontendLockKey !== serviceFrontendLockKey ||
    frontendReplicaBlock.frontendBlock.serviceName !== frontend.serviceName ||
    frontendReplicaBlock.frontendBlock.userId !== userId ||
    frontendReplicaBlock.frontendBlock.frontendName !== frontend.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-block-target-mismatch',
      message: 'Service frontend replica block does not match the bound target',
      extra: {
        expectedSystemId: systemId,
        expectedServiceName: frontend.serviceName,
        expectedUserId: userId,
        expectedFrontendName: frontend.frontendName,
        expectedServiceFrontendLockKey: serviceFrontendLockKey,
        actualSystemId: frontendReplicaBlock.systemId,
        actualServiceName: frontendReplicaBlock.serviceName,
        actualUserId: frontendReplicaBlock.userId,
        actualFrontendName: frontendReplicaBlock.frontendName,
        actualServiceFrontendLockKey:
          frontendReplicaBlock.serviceFrontendLockKey,
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

  const frontendBlock = frontendReplicaBlock.frontendBlock;
  if (
    frontendBlock.serviceName !== frontend.serviceName ||
    frontendBlock.userId !== userId ||
    frontendBlock.frontendName !== frontend.frontendName ||
    frontendBlock.frontendIndex !== frontendReplicaBlock.frontendIndex ||
    frontendReplicaBlock.frontendIndex !== currentFrontendIndex + 1
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-replica-server-block-target-mismatch',
      message:
        'Service frontend server block does not match its replica envelope',
    });
  }

  yield* applyServiceFrontendBlock({
    frontend,
    userId,
    currentFrontendIndex,
    db,
    models,
    frontendBlock,
  });
  return 'applied';
});
