import type { IDb } from '@zerospin/core/drizzle/types';
import { RpcTarget } from 'capnweb';
import type { SQL } from 'drizzle-orm';
import { Brand, Effect } from 'effect';

import type { IAlarmRegistry } from '../../../packages/system-worker/src/makeAlarmRegistry/makeAlarmRegistry.js';
import { versionedAggregateChainDbConfig } from '../../../packages/system-worker/src/VersionedAggregateChain/versionedAggregateChainDbConfig.js';

/**
 * A fanout owner implements `IFanoutRepo<NAME, SUBSCRIBER>` (queue name and receiver repo) with a
 * prototype getter returning the `makeFanoutQueue` RpcTarget. Enroll is
 * `queue.subscribe(MatchParams & { currentIndex })` — factory-owned via
 * constructor-local `subscriberNameUtils` + `key`. Do not put
 * `IRepoNameUtils` on the Cap'n Web wire. Do not hand-roll `enroll*` helpers.
 *
 * `makeFanoutQueue` binds explicit `db`, `schema`, `subscribersTableName`,
 * `entriesTableName`, and `indexColumnName`; its row type comes from the entries
 * table. The factory reads at most 64 complete rows in ascending index order,
 * exclusively after `afterIndex` and inclusively through optional `maxIndex`.
 * The returned
 * `IFanoutDelivery<ROW>` contains complete `rows` and `lastIndex`, the source
 * committed deliverable tip, independently of a requested page upper bound.
 * Finalized tables retain terminal occurrences, including rejections.
 * `queue.getPage(...)` shares that reader without taking the drain lock.
 * Local `drain(): Promise<void>` starts delivery immediately through managedRuntime.
 * Its Effect reads the entries table's persisted tip and raises the remembered
 * highest index before acquiring the drain lock. The queue observes background
 * rejection internally but returns the original Promise so awaiting it still fails.
 * Admission and publication call drain() without awaiting delivery. The factory
 * registers its internal drain Effect with the inherited alarmRegistry; the common
 * Repo alarm dispatches it alongside other queue drains and a configured superclass alarm. Owners retain alarm holds before committing source rows
 * and use finalizers so partially successful writes also start a drain.
 * Caller-supplied concurrency bounds subscriber pages and active deliveries.
 * Each query selects the oldest unfailed subscribers behind that index, excluding
 * in-memory pending identities in SQL before LIMIT. Optional `subscribersWhere`
 * supplies a tuple of additional AND predicates; undefined entries are ignored.
 * AC and SAC use it to exclude invalidated materializers. Completion frees
 * a slot; a subscriber with another page may be selected again in the same drain.
 * The queue caches one suffix and refetches whenever it no longer covers the
 * selected subscriber's next position. Each delivery retains its own row slice
 * and the tip captured with that cached page.
 * Owners supply the receiver class's inherited `Repo.getRepo` static as `getRepo`. The factory parses
 * each persisted subscriber name with `subscriberNameUtils.parseName`, passes
 * that key unchanged to `getRepo({ key })`, and invokes
 * `${name}Subscriber(sourceKey)` with the queue owner's key.
 * It sends the complete envelope through `receive(delivery)`, decodes the result,
 * and advances to the last delivered row index only after successful durable
 * receipt. The envelope tip is never an acknowledgement.
 * Lookup, delivery, decoding, and acknowledgement-write errors or defects persist
 * as terminal subscriber failure. Enrollment never clears failure or retries that
 * subscriber. Failed failure persistence aborts the drain with its alarm held.
 * Enrollment uses a short local transaction outside the drain lock and retains
 * the alarm before committing. Enrollment and acknowledgements advance cursors
 * monotonically. A drain may be waiting for this subscriber to cold-activate;
 * acquiring its lock during activation-time enrollment would deadlock.
 * Every successful subscription starts drain() after committing,
 * including on a cold queue. The factory needs no ctx or waitUntil.
 * Empty suffixes wait for the next drain call, which rereads the persisted tip.
 * Completed drains release their lease; interrupted work resumes durable cursors.
 * Interrupting a caller awaiting the Promise does not cancel queue-owned delivery.
 * Fanout has no hasPending API. All production fanouts use this factory.
 *
 * A fanout subscriber implements `IFanoutSubscriberRepo<QUEUE>` through a
 * `${QUEUE['name']}Subscriber(sourceKey)` prototype method. It returns a new
 * `makeFanoutSubscriber` target bound to that source, the owner enrollment key,
 * the source class's inherited `Repo.getRepo` lookup, a durable cursor reader,
 * and the owner receive Effect. Owner-held execution permits serialize every
 * target for the same receiver; no target cache or registry is needed.
 * AC reconciles VAR destinations from deployed aggregate definitions during
 * activation, preserving delivery cursors and failures. VARs do not subscribe
 * themselves to AC. Empty command histories do not activate them.
 * Aggregate service targets bind `{ systemId, serviceName, serviceVersion }`:
 * the accessor verifies the supplied systemId equals its owner identity and the
 * name/version matches the selected aggregate definition and a services cursor
 * exists before returning the capability. Receive retains its own source checks.
 *
 * `subscriber.catchup(index?)` reads pages after durable local progress. An
 * omitted destination captures the first response's lastIndex once; subsequent
 * requests use that fixed maxIndex. Pulled and pushed envelopes share the
 * receive Effect and commit path. An already reached destination returns; an
 * empty history at zero succeeds. Invalid tips/destinations, unavailable history
 * below the destination, or a receipt that makes no progress fail rather than loop.
 * `subscriber.subscribe(index?)` completes that catch-up, rereads the committed
 * cursor, and enrolls it through the source queue's existing subscribe RPC.
 * Retained rows cover the catch-up-to-enrollment gap. Hold no execution permit
 * or database transaction across page requests or source enrollment. Subscription
 * is awaited inside onDOActivation, before the activation gate opens.
 *
 * AC activation adopts bundled config as desiredBaseAggregateVersion, initializing
 * the applied base only for a new chain. A retained cutover alarm compares and
 * promotes outside activation. Config-only changes leave authored System specs unchanged.
 * Historical service materializers enroll during onDOActivation through subscriber.subscribe without
 * a separate initialization RPC. Subscription order grants no promotion order;
 * cutover requires a numerically newer major/minor/patch version.
 * VAR and VSR retain terminal result recovery around subscriber catch-up.
 * Receive commits supplied admitted rows under the owner's execution permit and
 * schedules result publication.
 * VAR and UVAR initialize services.lastIndex from their selected snapshot
 * aggregate.services at activation, preserving existing source progress. Resource
 * membership is the replica row or tombstone; its serviceIndex is independent.
 * Creating a copy never creates subscriptions or rewinds the source
 * cursor. Late-resource repair still reads history behind an advanced source
 * cursor. Explicit reads catchup without re-enrollment; alarms only drain queues.
 * Receivers tolerate committed-prefix redelivery after interruption, without
 * exposing partial acknowledgement in the fanout contract. Outboxes are unchanged.
 *
 * The outbox pair follows the same owner class convention:
 * `IOutboxRepo<'queueName'>` exposes `makeOutboxQueue` from a private field
 * through a prototype getter; `IOutboxSubscriberRepo<Sender['queueName']>`
 * exposes `makeOutboxSubscriber` through `queueNameSubscriber`. Its receive
 * parameter is inferred from the sender's full Drizzle row.
 *
 * Outbox owners insert stable integer `outboxIndex` rows in their own domain
 * transactions, with nullable `deliveredAt` and `lastDeliveryFailure`.
 * The factory owns SQL LIMIT 64 paging, exact-page retain/delete acknowledgement,
 * retries and alarm leases. `deliver(rows)` binds one receiver;
 * there is no enqueue RPC, subscriber registry or row-dependent routing.
 * The base DO gate completes onDOActivation before exposing owner capabilities;
 * queue factories do not accept readiness callbacks. Activation awaits source
 * subscription without an execution permit or transaction across RPCs. Outbox
 * factories register their unbounded drain Effect with the inherited registry.
 * Receivers must durably commit before success and tolerate committed-prefix
 * redelivery. The common Repo base owns alarmRegistry and alarm(); owners do not
 * keep private registries or alarm dispatch wrappers. Registration rebuilds on every
 * construction without reading storage or starting delivery. Subscriptions belong
 * to activation; all registered queue operations settle independently.
 * Owner activation schedules recovery; an idle
 * failed queue keeps its alarm lease. Factory `receive` stays inline.
 *
 * @bad Second generic `SUBSCRIBE_PROPS` on `IFanoutRepo` (ad-hoc wire bags).
 * @bad Put `repoUtils` on the subscribe RPC props.
 * @bad Owner `subscribe:` enroll callback beside `makeFanoutQueue`.
 * @bad One-consumer `makeAggregateFanoutQueue` / `enroll*` wrapper files.
 * @bad Create `FanoutQueue/subscribe/` method folders.
 * @bad Query command rows per subscriber or derive readiness from a table maximum.
 * @bad Brand `undefined`.
 * @bad Keep tip-notify dual cursors or a separate fanout pending query.
 */
export type IFanoutDelivery<ROW> = {
  rows: readonly ROW[];
  lastIndex: number;
};

export type IFanoutSubscribeResult = Brand.Brand<'IFanoutSubscribeResult'>;

export type IFanoutRepo<
  FANOUT_QUEUE_NAME extends string,
  _SUBSCRIBER extends IFanoutSubscriberRepo<{
    readonly name: FANOUT_QUEUE_NAME;
  }>,
> = {
  readonly [K in FANOUT_QUEUE_NAME]: RpcTarget;
};

export type IFanoutSubscriberRepo<QUEUE extends { readonly name: string }> = {
  readonly [K in `${QUEUE['name']}Subscriber`]: (
    sourceKey: QUEUE extends { readonly _sourceKey?: infer SOURCE_KEY }
      ? NonNullable<SOURCE_KEY>
      : never,
  ) => RpcTarget & {
    receive(
      delivery: IFanoutDelivery<unknown>,
    ): Promise<{ _tag: 'Success'; success: void }>;
  };
};

export class VersionedAggregateChain
  extends RpcTarget
  implements IFanoutRepo<'replicaFanoutQueue', UserVersionedAggregateRepo>
{
  declare static readonly getRepo: (props: {
    key: Parameters<
      UserVersionedAggregateRepo['replicaFanoutQueueSubscriber']
    >[0];
  }) => Effect.Effect<{
    readonly replicaFanoutQueue: PromiseLike<
      VersionedAggregateChain['replicaFanoutQueue']
    >;
  }>;

  declare readonly db: IDb;
  declare readonly schema: typeof versionedAggregateChainDbConfig.schema;
  declare readonly alarmRegistry: IAlarmRegistry;

  readonly #replicaFanoutQueue = makeFanoutQueue({
    name: 'replicaFanoutQueue',
    concurrency: 100,
    subscriberNameUtils: replicaNameUtils,
    key: {
      systemId: 'sys',
      aggregateId: 'acct',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
    },
    db: this.db,
    schema: this.schema,
    alarmRegistry: this.alarmRegistry,
    subscribersTableName: 'replicaSubscribers',
    entriesTableName: 'commands',
    indexColumnName: 'outboxIndex',
    getRepo: UserVersionedAggregateRepo.getRepo,
  });

  get replicaFanoutQueue() {
    return this.#replicaFanoutQueue;
  }
}

export class UserVersionedAggregateRepo extends RpcTarget {
  declare static readonly getRepo: (props: {
    key: Record<string, string>;
  }) => Effect.Effect<{
    replicaFanoutQueueSubscriber(
      sourceKey: Parameters<
        UserVersionedAggregateRepo['replicaFanoutQueueSubscriber']
      >[0],
    ): PromiseLike<
      ReturnType<UserVersionedAggregateRepo['replicaFanoutQueueSubscriber']>
    >;
  }>;

  declare readonly receive: (
    delivery: IFanoutDelivery<{ outboxIndex: number }>,
  ) => Effect.Effect<void>;
  declare readonly getCurrentIndex: () => number;
  readonly key = {
    systemId: 'sys',
    aggregateId: 'acct',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    userId: 'user_1',
    frontendName: 'main',
  };

  replicaFanoutQueueSubscriber(sourceKey: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: string;
  }) {
    return makeFanoutSubscriber({
      name: 'replicaFanoutQueue',
      sourceKey,
      key: this.key,
      getRepo: VersionedAggregateChain.getRepo,
      getCurrentIndex: this.getCurrentIndex,
      receive: this.receive,
    });
  }
}

declare const replicaNameUtils: {
  makeName(params: Record<string, string>): Effect.Effect<string>;
  parseName(name: string): Effect.Effect<Record<string, string>>;
};

declare function makeFanoutQueue(props: {
  name: 'replicaFanoutQueue';
  concurrency: number;
  subscriberNameUtils: typeof replicaNameUtils;
  key: Record<string, string>;
  db: IDb;
  schema: typeof versionedAggregateChainDbConfig.schema;
  alarmRegistry: IAlarmRegistry;
  subscribersTableName: 'replicaSubscribers';
  entriesTableName: 'commands';
  indexColumnName: 'outboxIndex';
  getRepo: typeof UserVersionedAggregateRepo.getRepo;
  subscribersWhere?: readonly [SQL | undefined, ...(SQL | undefined)[]];
}): RpcTarget & {
  readonly drain: () => Promise<void>;
  readonly name: 'replicaFanoutQueue';
  getPage(props: { afterIndex: number; maxIndex?: number }): Promise<{
    _tag: 'Success';
    success: IFanoutDelivery<{ outboxIndex: number }>;
  }>;
  subscribe(
    props: { currentIndex: number | null } & Record<string, string>,
  ): Promise<{ _tag: 'Success'; success: IFanoutSubscribeResult }>;
};

declare function makeFanoutSubscriber(props: {
  name: 'replicaFanoutQueue';
  sourceKey: Parameters<
    UserVersionedAggregateRepo['replicaFanoutQueueSubscriber']
  >[0];
  key: UserVersionedAggregateRepo['key'];
  getRepo: typeof VersionedAggregateChain.getRepo;
  getCurrentIndex: () => number;
  receive: (
    delivery: IFanoutDelivery<{ outboxIndex: number }>,
  ) => Effect.Effect<void>;
}): RpcTarget & {
  receive(
    delivery: IFanoutDelivery<{ outboxIndex: number }>,
  ): Promise<{ _tag: 'Success'; success: void }>;
  catchup(index?: number): Promise<{ _tag: 'Success'; success: void }>;
  subscribe(index?: number): Promise<{ _tag: 'Success'; success: void }>;
};
