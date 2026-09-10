import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

/**
 * Every production RpcTarget lives in a same-named folder and delegates each
 * public method to a same-named foldered Effect.fn.
 *
 * PartitionApi/PartitionApi.ts
 * PartitionApi/acquireAggregateFrontendReplica/acquireAggregateFrontendReplica.ts
 *
 * Exception: IFanoutRepo owners inline `makeFanoutQueue` on the class (`#field`
 * + prototype getter). IFanoutSubscriberRepo owners inline `makeFanoutSubscriber`
 * inside `${queueName}Subscriber(sourceKey)` prototype methods, binding one
 * source queue and its durable receiver cursor on each call. Do not add
 * `FanoutQueue/getPage/`, `FanoutQueue/subscribe/`, `FanoutSubscriber/receive/`,
 * `FanoutSubscriber/catchup/`, `FanoutSubscriber/subscribe/`, or `<queueName>/`
 * method folders. Factory queue `getPage` / `subscribe` and subscriber
 * `receive` / `catchup` / `subscribe` methods remain inline.
 * See `system-worker/i-fanout-repo.ts`.
 *
 * @bad Keep a full RPC workflow inline in the RpcTarget class.
 * @bad Exempt an Api, gateway, provider, or failure target because it is not a Repo.
 * @bad Import `acquireAggregateFrontendReplica` under an alias when the class already supplies scope.
 * @bad Create an `index.ts` barrel just to re-export the method file.
 * @bad Create a method folder for an IFanoutRepo queue or its nested `subscribe`.
 * @bad Create a method folder for an IFanoutSubscriberRepo or its nested `receive`.
 */
export class PartitionApi extends RpcTarget {
  constructor(
    readonly runtime: typeof managedRuntime,
    readonly db: unknown,
  ) {
    super();
  }

  async acquireAggregateFrontendReplica(props: { frontendName: string }) {
    return this.runtime.runPromise(
      acquireAggregateFrontendReplica({
        frontendName: props.frontendName,
        db: this.db,
      }).pipe(encodeRpc),
    );
  }
}

export const acquireAggregateFrontendReplica = Effect.fn(
  'PartitionApi.acquireAggregateFrontendReplica',
)(function* (props: { frontendName: string; db: unknown }) {
  return yield* acquireReplica(props);
});

declare const managedRuntime: {
  runPromise(effect: unknown): Promise<unknown>;
};
declare function encodeRpc(effect: unknown): unknown;
declare function acquireReplica(props: {
  frontendName: string;
  db: unknown;
}): Effect.Effect<void>;
