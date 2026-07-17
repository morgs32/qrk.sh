import { Effect } from 'effect';

/**
 * Downstream publish belongs on subscriber DO — not `subscriberMap` callbacks in makeFanoutRepo.
 *
 * @bad Put `successShape` + `onSuccessfulFanout` on fanout factory subscriberMap entries.
 */
export const actorRepoSubscriberMap = {
  actorRepo: { getRepo: name => env.ACTOR_REPO.getByName(name) },
};

export const applyFanoutBatchInTx = Effect.fn('ActorRepo.applyFanoutBatchInTx')(
  function* (
    this: { internals: { db: unknown; schema: unknown } },
    props: { tx: unknown; events: readonly unknown[] },
  ) {
    return yield* buildActorDeltaSuccess({
      tx: props.tx,
      events: props.events,
      internals: this.internals,
    });
  },
);

export class ActorRepo {
  internals = {} as { db: unknown; schema: unknown };

  async fanout(events: readonly unknown[]) {
    return runtime.runPromise(
      ActorRepo.repoUtils.encodeFanout({ internals: this.internals, events }),
    );
  }

  static repoUtils = {
    encodeFanout: (_props: unknown) => Effect.void,
  };
}

declare const env: {
  ACTOR_REPO: { getByName(name: string): unknown };
};
declare function buildActorDeltaSuccess(
  props: unknown,
): Effect.Effect<unknown, unknown, unknown>;
declare const runtime: { runPromise: (effect: unknown) => Promise<unknown> };
