import { ZerospinError } from '@zerospin/error';
import { makeRpcHandler, type IRpcRequest } from '@zerospin/logger';
import { DurableObject } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

// Attempt counts are observation-only. The spec separately requests a one-shot
// delivery failure in Durable Object storage so retry policy stays with the
// AccountBlockRepo alarm workflow across real workerd turns.
export class ActorRepo extends DurableObject {
  async handleAccountBlocks(request: IRpcRequest<[]>) {
    const storage = this.ctx.storage;

    return Effect.runPromise(
      makeRpcHandler('ActorRepo.handleAccountBlocks')(function* () {
        const priorAttempts = yield* Effect.promise(() =>
          storage.get<number>('subscriberDeliveryAttempts'),
        );
        const subscriberDeliveryAttempts = (priorAttempts ?? 0) + 1;
        yield* Effect.promise(() =>
          storage.put('subscriberDeliveryAttempts', subscriberDeliveryAttempts),
        );

        const failNextActorDelivery = yield* Effect.promise(() =>
          storage.get<boolean>('failNextActorDelivery'),
        );
        if (failNextActorDelivery === true) {
          yield* Effect.promise(() => storage.delete('failNextActorDelivery'));
          return yield* new ZerospinError({
            code: 'mock-actor-delivery-failure',
            message: 'mock actor delivery failure',
          }).pipe(Effect.mapError(Schema.encodeSync(ZerospinError.schema)));
        }

        yield* Effect.logInfo('actor delivery succeeded');
      })(request),
    );
  }
}
