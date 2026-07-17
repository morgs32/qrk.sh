import { makeTable } from '@zerospin/core/models/makeTable';
import { primitives } from '@zerospin/core/models/primitives';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { Effect } from 'effect';

/**
 * Persist the exact prefixed `*RepoName` and pass that stored value unchanged to `getByName` during delivery.
 *
 * @bad Do not persist only an actor or service domain name and rebuild the Durable Object name during delivery.
 * @bad Do not store a Durable Object identity in a generic `name` or `serviceName` column instead of an explicit `*RepoName` column.
 * @bad Do not strip the repo prefix before lookup or retry an unprefixed legacy name when lookup fails.
 */
const actorSubscriberTable = makeTable({
  name: 'actorSubscribers',
  shape: {
    actorRepoName: primitives.primaryKey({
      abbreviation: coreAbbreviations.actorRepo,
    }),
  },
});

export const actorRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.actorRepo,
  namePattern: parseRoutePattern(
    '/:generationId/:accountId/:accountName/:actorName/:actorId',
  ),
  managedRuntime,
  getDbConfig,
});

export const rememberActorSubscriber = Effect.fn(
  'rememberActorSubscriber',
)(function* (props: {
  actorKey: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
  };
}) {
  const actorRepoName = yield* actorRepoUtils.nameUtils.makeName(props.actorKey);

  db.insert(actorSubscriberTable).values({ actorRepoName }).run();
});

export const deliverAccountBlocks = Effect.fn('deliverAccountBlocks')(
  function* (props: { blocks: readonly unknown[] }) {
    const subscriber = db.select().from(actorSubscriberTable).get();
    if (subscriber === undefined) {
      return;
    }

    const actorRepo = env.ACTOR_REPO.getByName(subscriber.actorRepoName);
    yield* Effect.promise(() => actorRepo.handleAccountBlocks(props.blocks));
  },
);

declare function makeRepoUtils(props: {
  abbreviation: string;
  namePattern: unknown;
  managedRuntime: unknown;
  getDbConfig: unknown;
}): {
  nameUtils: {
    makeName(props: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorName: string;
      actorId: string;
    }): Effect.Effect<string>;
  };
};
declare function parseRoutePattern(pattern: string): unknown;
declare const managedRuntime: unknown;
declare const getDbConfig: unknown;
declare const db: {
  insert(table: unknown): {
    values(row: { actorRepoName: string }): { run(): void };
  };
  select(): {
    from(table: unknown): {
      get(): { actorRepoName: string } | undefined;
    };
  };
};
declare const env: {
  ACTOR_REPO: {
    getByName(name: string): {
      handleAccountBlocks(blocks: readonly unknown[]): Promise<void>;
    };
  };
};
