import { makeZerospinError, ZerospinErrorSchema } from '@zerospin/error';
import { makeRpcHandler } from '@zerospin/logger';
import { Effect, Schema } from 'effect';

import { harness } from './queuedJobs.ts';

const handleAccountBlocksHandler = makeRpcHandler(
  'ActorRepo.handleAccountBlocks',
)(function* () {
  harness.subscriberDeliveryAttempts += 1;
  if (harness.failNextActorDelivery) {
    harness.failNextActorDelivery = false;
    return yield* Effect.fail(
      makeZerospinError({
        code: 'mock-actor-delivery-failure',
        message: 'mock actor delivery failure',
      }),
    ).pipe(Effect.mapError(Schema.encodeSync(ZerospinErrorSchema)));
  }
  yield* Effect.logInfo('actor delivery succeeded');
});

export const actorRepo = {
  handleAccountBlocks: (
    request: Parameters<typeof handleAccountBlocksHandler>[0],
  ) => Effect.runPromise(handleAccountBlocksHandler(request)),
};
