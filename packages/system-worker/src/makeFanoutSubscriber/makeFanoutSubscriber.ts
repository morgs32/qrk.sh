import type { Async } from '@zerospin/core/async/Async';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import { managedRuntime } from '../managedRuntime.js';

/**
 * One source-bound fanout capability. RPC methods live on the prototype;
 * `name` is an instance field (local only).
 */
/*
 * Repo subscriber accessors bind one source and its durable local cursor.
 * Pulled and pushed pages use the same owner receive Effect. Catch-up fixes
 * its destination from the first page; subscription then enrolls that cursor.
 *
 * 1. Bind the source, receiver, and durable cursor reader.
 * 2. Catch up through one fixed destination without retaining an owner lock.
 * 3. Apply full pages before advancing the local cursor.
 * 4. Expose receive, catchup, and subscribe on the RPC prototype.
 * 5. Enroll only after catch-up succeeds.
 */
export const makeFanoutSubscriber = <
  NAME extends string,
  SOURCE_KEY extends Readonly<Record<string, string>>,
  KEY extends Readonly<Record<string, string>>,
  ROW,
>(props: {
  name: NAME;
  sourceKey: SOURCE_KEY;
  key: KEY;
  getRepo: (props: { key: SOURCE_KEY }) => Effect.Effect<
    {
      readonly [K in NAME]: PromiseLike<{
        getPage(props: {
          afterIndex: number;
          maxIndex?: number;
        }): PromiseLike<IEncodedResult<IFanoutDelivery<ROW>, IAnyErrorJson>>;
        subscribe(
          props: KEY & { currentIndex: number | null },
        ): PromiseLike<IEncodedResult<unknown, IAnyErrorJson>>;
      }>;
    },
    IAnyError,
    Async
  >;
  getCurrentIndex: () => number;
  receive: (
    delivery: IFanoutDelivery<NoInfer<ROW>>,
  ) => Effect.Effect<void, IAnyError, Async | CuidFactory | MonotonicFactory>;
}): RpcTarget & {
  readonly name: NAME;
  receive(
    delivery: IFanoutDelivery<ROW>,
  ): Promise<IEncodedResult<void, IAnyErrorJson>>;
  catchup(index?: number): Promise<IEncodedResult<void, IAnyErrorJson>>;
  subscribe(index?: number): Promise<IEncodedResult<void, IAnyErrorJson>>;
} => {
  // 1 — one instance always addresses the same source queue and local cursor
  const { name, sourceKey, key, getRepo, getCurrentIndex, receive } = props;
  const currentIndex = Effect.try({
    try: getCurrentIndex,
    catch: ZerospinError.catch({ code: 'fanout-subscriber-cursor-failed' }),
  });

  // 2 — the first page supplies the destination only when the caller did not
  const catchup = Effect.fn(`${name}.catchup`)(function* (index?: number) {
    if (index !== undefined && (!Number.isSafeInteger(index) || index < 0)) {
      return yield* new ZerospinError({
        code: 'fanout-catchup-index-invalid',
        message: 'Catch-up requires a nonnegative safe integer index',
      });
    }
    let cursor = yield* currentIndex;
    if (index !== undefined && cursor >= index) return;
    const repo = yield* getRepo({ key: sourceKey });
    const queue = yield* makeAsync(() => repo[name]);
    let destination = index;
    for (;;) {
      const requestedCursor = cursor;
      const delivery = yield* makeAsync(() =>
        queue.getPage({
          afterIndex: cursor,
          ...(destination === undefined ? {} : { maxIndex: destination }),
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      if (!Number.isSafeInteger(delivery.lastIndex) || delivery.lastIndex < 0) {
        return yield* new ZerospinError({
          code: 'fanout-catchup-tip-invalid',
          message: 'The source returned an invalid deliverable tip',
        });
      }
      destination ??= delivery.lastIndex;
      // A concurrent push can commit while the source page is in flight.
      cursor = yield* currentIndex;
      if (cursor >= destination) return;
      if (delivery.rows.length === 0) {
        return yield* new ZerospinError({
          code: 'fanout-catchup-history-missing',
          message: `Fanout history is unavailable after ${cursor} through ${destination}`,
        });
      }

      // 3 — the owner serializes and durably commits both pulled and pushed rows
      yield* receive(delivery);
      const committed = yield* currentIndex;
      if (committed >= destination) return;
      if (committed <= requestedCursor) {
        return yield* new ZerospinError({
          code: 'fanout-catchup-no-progress',
          message: `Fanout receipt did not advance the committed cursor after ${cursor}`,
        });
      }
      cursor = committed;
    }
  });

  // 4 — public methods are thin RPC boundaries over the bound owner operations
  class FanoutSubscriber extends RpcTarget {
    name: NAME;

    constructor() {
      super();
      this.name = name;
    }

    async receive(
      delivery: IFanoutDelivery<ROW>,
    ): Promise<IEncodedResult<void, IAnyErrorJson>> {
      return managedRuntime.runPromise(
        Effect.suspend(() => receive(delivery)).pipe(
          Effect.provide(AsyncLive),
          encodeRpc,
        ),
      );
    }

    catchup(index?: number): Promise<IEncodedResult<void, IAnyErrorJson>> {
      return managedRuntime.runPromise(
        catchup(index).pipe(Effect.provide(AsyncLive), encodeRpc),
      );
    }

    subscribe(index?: number): Promise<IEncodedResult<void, IAnyErrorJson>> {
      return managedRuntime.runPromise(
        Effect.gen(function* () {
          // 5 — enrollment holds no receiver lock and cannot skip retained rows
          yield* catchup(index);
          const cursor = yield* currentIndex;
          const repo = yield* getRepo({ key: sourceKey });
          const queue = yield* makeAsync(() => repo[name]);
          yield* makeAsync(() =>
            queue.subscribe({
              ...key,
              currentIndex: cursor === 0 ? null : cursor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
        }).pipe(Effect.provide(AsyncLive), encodeRpc),
      );
    }
  }

  return new FanoutSubscriber();
};
