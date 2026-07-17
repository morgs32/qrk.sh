import { Effect } from 'effect';

/**
 * Public system-worker Repo methods delegate to a same-named foldered Effect.fn.
 *
 * @bad Keep a large public DO RPC method body inline in `SomeRepo.ts`.
 * @bad Import alias `someRepoMethod as executeSomeRepoMethod` when the class method shares the name.
 * @bad Create an `index.ts` barrel just to re-export method files.
 */
export class SomeRepo {
  async someRepoMethod(props: { id: string }) {
    return managedRuntime.runPromise(
      Effect.gen(function* () {
        return yield* someRepoMethod({ ...props, dbAdapter });
      }).pipe(encodeRpc),
    );
  }
}

export const someRepoMethod = Effect.fn('SomeRepo.someRepoMethod')(
  function* (props: { id: string; dbAdapter: unknown }) {
    return yield* doWork(props);
  },
);

declare const managedRuntime: {
  runPromise: (effect: unknown) => Promise<unknown>;
};
declare const encodeRpc: (effect: unknown) => unknown;
declare const dbAdapter: unknown;
declare function doWork(props: {
  id: string;
  dbAdapter: unknown;
}): Effect.Effect<unknown, unknown, unknown>;
