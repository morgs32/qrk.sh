import { Effect } from 'effect';

/**
 * Use `repoUtils` for static repo metadata, and use explicit `get*Repo`
 * helpers for Durable Object stub lookup.
 *
 * @bad Do not call `FrontendRepo.repoUtils.getRepo(...)`; generic lookup does not live on repoUtils.
 * @bad Do not wrap `FrontendRepo` in `as unknown as` to recover helper typing for a one-off test call.
 * @bad Do not define local one-call `getRepo` shims when a same-named repo lookup helper exists.
 */
export const useFrontendRepo = Effect.fn('useFrontendRepo')(function* () {
  const key = {
    accountId: 'acct_1',
    accountName: 'owner-account',
    actorId: 'actr_owner',
    actorName: 'owner-actor',
    frontendName: 'default',
  };

  const name = yield* FrontendRepo.repoUtils.nameUtils.makeName(key);
  const frontendRepo = yield* getFrontendRepo({ key });

  yield* callFrontendRepo(frontendRepo, name);
});

/**
 * @bad
 */
export const useRepoUtilsGetRepo = Effect.fn('useRepoUtilsGetRepo')(
  function* () {
    const frontendRepo = FrontendRepo.repoUtils.getRepo({
      key: {
        accountId: 'acct_1',
        accountName: 'owner-account',
        actorId: 'actr_owner',
        actorName: 'owner-actor',
        frontendName: 'default',
      },
    });

    yield* callFrontendRepo(frontendRepo, 'acct_1/owner-account/owner-actor');
  },
);

declare const FrontendRepo: {
  repoUtils: {
    nameUtils: {
      makeName(props: {
        accountId: string;
        accountName: string;
        actorId: string;
        actorName: string;
        frontendName: string;
      }): Effect.Effect<string>;
    };
    getRepo(props: {
      key: {
        accountId: string;
        accountName: string;
        actorId: string;
        actorName: string;
        frontendName: string;
      };
    }): unknown;
  };
};
declare function getFrontendRepo(props: {
  key: {
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
  };
}): Effect.Effect<unknown>;
declare function callFrontendRepo(
  repo: unknown,
  name: string,
): Effect.Effect<void>;
