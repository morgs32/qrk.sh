import { Effect } from 'effect';

/**
 * Subscriber repo wiring stays explicit — no spread passthrough into fanout subscriber factories.
 *
 * @bad Do not hide factory inputs behind `makeFanoutSubscriberRepo({ ...repoProps, applyFanoutBatchInTx })`.
 * @bad Do not reintroduce `handleFanout` / `applyInTx` callback layers around batch apply.
 */
export const actorRepoUtils = makeRepoUtils({
  abbreviation: 'actrrepo',
  namePattern: parseRoutePattern(
    '/:accountId/:accountName/:actorName/:actorId',
  ),
  managedRuntime,
  getInternals,
});

export class FixtureSubscriber extends makeFanoutSubscriberRepo({
  fanout: ParentFanout,
  repoUtils: fixtureSubscriberRepoUtils,
  applyFanoutBatchInTx: Effect.fn('FixtureSubscriber.applyFanoutBatchInTx')(
    function* (props) {
      yield* applyDomainEvents({
        tx: props.tx,
        events: props.events,
      });
    },
  ),
}) {}

declare function makeRepoUtils(props: {
  abbreviation: string;
  namePattern: unknown;
  managedRuntime: unknown;
  getInternals: unknown;
}): unknown;
declare function parseRoutePattern(pattern: string): unknown;
declare const managedRuntime: unknown;
declare function getInternals(): unknown;
declare function makeFanoutSubscriberRepo(props: {
  fanout: unknown;
  repoUtils: unknown;
  applyFanoutBatchInTx: (props: {
    ctx: DurableObjectState;
    name: string;
    key: unknown;
    tx: unknown;
    schema: unknown;
    relations: unknown;
    events: readonly unknown[];
  }) => Effect.Effect<void, unknown>;
}): new () => unknown;
declare const ParentFanout: unknown;
declare const fixtureSubscriberRepoUtils: unknown;
declare function applyDomainEvents(props: {
  tx: unknown;
  events: readonly unknown[];
}): Effect.Effect<void, unknown, unknown>;
