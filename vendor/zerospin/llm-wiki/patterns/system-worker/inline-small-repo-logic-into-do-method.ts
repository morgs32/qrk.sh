import { Effect } from 'effect';

/**
 * Inline non-public one-consumer repo helpers into the owning public method file.
 *
 * @bad Create `shared/applyOneMutation.ts` for a helper called once.
 * @bad Add a module-level helper above the public method file when its only caller is that method.
 * @bad Use this rule to inline a public system-worker Repo RPC method back into the class file.
 */
export const applyActorPushBatch = Effect.fn('ActorRepo.applyActorPushBatch')(
  function* (props: { db: unknown; mutations: readonly unknown[] }) {
    return yield* makeTx({
      db: props.db,
      program: Effect.fn('ActorRepo.applyActorPushBatch.transaction')(
        function* ({ tx }) {
          for (const mutation of props.mutations) {
            yield* applyMutationTx({ tx, mutation, appliedAt: Date.now() });
          }
        },
      ),
    });
  },
);

export class ActorRepo {
  async applyActorPushBatch(props: { mutations: readonly unknown[] }) {
    return managedRuntime.runPromise(
      applyActorPushBatch({
        db: this.db,
        mutations: props.mutations,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  db = {} as unknown;
}

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const makeTx: (props: {
  db: unknown;
  program: unknown;
}) => Effect.Effect<unknown, unknown, unknown>;
declare const applyMutationTx: (props: {
  tx: unknown;
  mutation: unknown;
  appliedAt: number;
}) => Effect.Effect<void, unknown, unknown>;
declare const AsyncLive: unknown;
declare const encodeRpc: (effect: unknown) => unknown;
