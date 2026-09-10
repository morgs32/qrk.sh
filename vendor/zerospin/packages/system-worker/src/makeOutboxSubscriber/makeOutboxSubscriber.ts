import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyError, IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import { managedRuntime } from '../managedRuntime.js';

/**
 * Nested outbox-subscriber RpcTarget. `receive` is on the prototype
 * (RPC-reachable); `name` is an instance field (local only).
 */
/*
 * Repo subscriber getters use this nested RpcTarget to receive outbox
 * pages. The owner receive Effect supplies durable commit semantics; this
 * boundary supplies AsyncLive and RPC outcome encoding.
 *
 * 1. Capture the receiver policy.
 * 2. Create the nested subscriber capability.
 * 3. Apply rows and encode the acknowledgement.
 * 4. Return the bound subscriber.
 */
export const makeOutboxSubscriber = <NAME extends string, ROW>(props: {
  name: NAME;
  receive: (rows: readonly ROW[]) => Effect.Effect<void, IAnyError, Async>;
}): RpcTarget & {
  readonly name: NAME;
  receive(rows: readonly ROW[]): Promise<IEncodedResult<void, IAnyErrorJson>>;
} => {
  // 1 — bind the owner name and receive Effect
  const { name, receive } = props;

  // 2 — place receive on the RpcTarget prototype
  class OutboxSubscriber extends RpcTarget {
    name: NAME;

    constructor() {
      super();
      this.name = name;
    }

    async receive(
      rows: readonly ROW[],
    ): Promise<IEncodedResult<void, IAnyErrorJson>> {
      return managedRuntime.runPromise(
        // 3 — provide AsyncLive and encode the durable owner receive outcome
        Effect.suspend(() => receive(rows)).pipe(
          Effect.provide(AsyncLive),
          encodeRpc,
        ),
      );
    }
  }

  // 4 — retain the same receiver policy for subsequent calls
  return new OutboxSubscriber();
};

export type IOutboxSubscriberRepo<
  QUEUE extends {
    readonly name: string;
    readonly _outboxRow?: unknown;
  },
> = {
  readonly [K in `${QUEUE['name']}Subscriber`]: RpcTarget & {
    receive(
      rows: readonly NonNullable<QUEUE['_outboxRow']>[],
    ): Promise<IEncodedResult<void, IAnyErrorJson>>;
  };
};
