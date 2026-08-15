import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

/**
 * Every production RpcTarget lives in a same-named folder and delegates each
 * public method to a same-named foldered Effect.fn.
 *
 * PartitionApi/PartitionApi.ts
 * PartitionApi/acquireAggregateFrontendReplica/acquireAggregateFrontendReplica.ts
 *
 * @bad Keep a full RPC workflow inline in the RpcTarget class.
 * @bad Exempt an Api, gateway, provider, or failure target because it is not a Repo.
 * @bad Import `acquireAggregateFrontendReplica` under an alias when the class already supplies scope.
 * @bad Create an `index.ts` barrel just to re-export the method file.
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
