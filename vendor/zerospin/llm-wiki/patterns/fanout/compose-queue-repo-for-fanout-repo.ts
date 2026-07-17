import { Effect } from 'effect';

const DELIVERY_CONCURRENCY = 100;
const DELIVERY_BATCH_SIZE = 100;
const DELIVERY_ALARM_DELAY_MS = 250;

/**
 * Compose a fanout repo from the internal queue factory so subscriber draining lives in one place.
 *
 * @bad Keep `refresh`/`processSubscriber` queue wiring outside `makeQueueRepo` after construction.
 * @bad Export a standalone queue class for broad reuse when queue behavior is subscriber-only composition.
 */
export function makeFanoutRepo<
  const NAME extends string,
  const PAYLOAD,
  const SUBSCRIBERS,
>(props: {
  namePattern: NAME;
  payloadShape: PAYLOAD;
  subscriberMap: SUBSCRIBERS;
  managedRuntime: IFanoutManagedRuntime;
}): IFanoutRepo<NAME, PAYLOAD, SUBSCRIBERS> {
  const { managedRuntime, namePattern, payloadShape, subscriberMap } = props;

  class FanoutRepo extends makeQueueRepo<
    {
      subscriber: {
        id: string;
        name: string;
      };
    },
    {
      db: unknown;
      storage: DurableObjectStorage;
      queueSize: number;
      isQueueRunning: boolean;
    }
  >({
    managedRuntime,
    concurrency: DELIVERY_CONCURRENCY,
    alarmDelayMs: DELIVERY_ALARM_DELAY_MS,
    refresh: repo =>
      managedRuntime.runPromise(
        loadRunnableFanoutSubscriberDeliveries({
          storage: repo.storage,
          deliveryBatchSize: DELIVERY_BATCH_SIZE,
        }),
      ),
    processSubscriber: (repo, subscriberDelivery) =>
      managedRuntime.runPromise(
        handleFanoutSubscriber({
          subscriberDelivery,
          queueSize: repo.queueSize,
          isQueueRunning: repo.isQueueRunning,
        }),
      ),
    afterSettled: repo =>
      managedRuntime.runPromise(
        syncFanoutStatus({
          queueSize: repo.queueSize,
          isQueueRunning: repo.isQueueRunning,
        }),
      ),
  }) {
    db: unknown;
    storage: DurableObjectStorage;
    namePattern = namePattern;
    payloadShape = payloadShape;
    subscriberMap = subscriberMap;

    constructor(ctx: DurableObjectState, env: Env) {
      super(ctx, env);
      this.storage = this.ctx.storage;
      this.db = initializeDb({
        storage: this.storage,
      });
      this.queue.kick();
    }

    async publish(): Promise<void> {
      return Effect.runPromise(
        publishFanout({
          db: this.db,
          queue: this.queue,
          queueSize: this.queueSize,
          isQueueRunning: this.isQueueRunning,
        }).pipe(Effect.provide(AsyncLive)),
      );
    }
  }

  return FanoutRepo;
}

declare function makeQueueRepo<
  SUBSCRIBER_DELIVERY extends { subscriber: { id: string } },
  CONTEXT = object,
>(props: {
  managedRuntime: IFanoutManagedRuntime;
  alarmDelayMs?: number | undefined;
  concurrency?: number | undefined;
  refresh:
    | ((repo: CONTEXT) => Promise<readonly SUBSCRIBER_DELIVERY[]>)
    | ((repo: CONTEXT) => readonly SUBSCRIBER_DELIVERY[]);
  processSubscriber: (
    repo: CONTEXT,
    subscriberDelivery: SUBSCRIBER_DELIVERY,
  ) => Promise<void> | void;
  afterSettled?: (repo: CONTEXT) => Promise<void> | void | undefined;
}): new (
  ctx: DurableObjectState,
  env: Env,
) => {
  queue: { kick: () => Promise<void> | void };
  queueSize: number;
  isQueueRunning: boolean;
};

declare function loadRunnableFanoutSubscriberDeliveries(props: {
  storage: DurableObjectStorage;
  deliveryBatchSize: number;
}): Promise<
  readonly {
    subscriber: {
      id: string;
      name: string;
    };
  }[]
>;

declare function handleFanoutSubscriber(props: {
  subscriberDelivery: {
    subscriber: {
      id: string;
      name: string;
    };
  };
  queueSize: number;
  isQueueRunning: boolean;
}): Promise<void>;

declare function syncFanoutStatus(props: {
  queueSize: number;
  isQueueRunning: boolean;
}): Promise<void>;

declare function initializeDb(props: {
  storage: DurableObjectStorage;
}): unknown;

declare function publishFanout(props: {
  db: unknown;
  queue: { kick?: () => unknown } | unknown;
  queueSize: number;
  isQueueRunning: boolean;
}): Effect.Effect<void, unknown, unknown>;

declare const AsyncLive: unknown;
declare const IFanoutManagedRuntime: unknown;
declare type IFanoutManagedRuntime = {
  runPromise: <A>(effect: Effect.Effect<A, unknown, unknown>) => Promise<A>;
};

declare type IFanoutRepo<NAME extends string, PAYLOAD, SUBSCRIBERS> = unknown;
