import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import { encodeSuccess } from '@zerospin/core/utils/encodeSuccess';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';

import { makeFanoutSubscriber } from './makeFanoutSubscriber.js';

const makeFixture = (sourceId = 'source-a') => {
  const applied: Array<{ index: number; payload: string }> = [];
  const state = {
    cursor: 0,
    rows: Array.from({ length: 5 }, (_, offset) => ({
      index: offset + 1,
      payload: `row-${offset + 1}`,
    })),
    applied,
  };
  const queue = {
    getPage: vi.fn(
      async (request: {
        afterIndex: number;
        maxIndex?: number;
      }): Promise<
        IEncodedResult<
          IFanoutDelivery<{ index: number; payload: string }>,
          IAnyErrorJson
        >
      > =>
        encodeSuccess({
          rows: state.rows
            .filter(
              row =>
                row.index > request.afterIndex &&
                row.index <= (request.maxIndex ?? Infinity),
            )
            .slice(0, 2),
          lastIndex: state.rows.at(-1)?.index ?? 0,
        }),
    ),
    subscribe: vi.fn(
      async (_request: {
        subscriberId: string;
        currentIndex: number | null;
      }): Promise<IEncodedResult<void, IAnyErrorJson>> =>
        encodeSuccess(undefined),
    ),
  };
  const getRepo = vi.fn((_props: { key: { sourceId: string } }) =>
    Effect.succeed({ updates: Promise.resolve(queue) }),
  );
  const receive = vi.fn(
    (
      delivery: IFanoutDelivery<{ index: number; payload: string }>,
    ): Effect.Effect<void, IAnyError> =>
      Effect.sync(() => {
        for (const row of delivery.rows) {
          if (row.index <= state.cursor) continue;
          state.applied.push(row);
          state.cursor = row.index;
        }
      }),
  );
  const props = {
    name: 'updates',
    sourceKey: { sourceId },
    key: { subscriberId: 'subscriber-a' },
    getRepo,
    getCurrentIndex: () => state.cursor,
    receive,
  };
  const subscriber = makeFanoutSubscriber(props);
  return { state, queue, getRepo, receive, props, subscriber };
};

describe('makeFanoutSubscriber', () => {
  it('exposes source-bound RPC methods on the prototype', () => {
    const { subscriber } = makeFixture();
    expect(Object.hasOwn(subscriber, 'name')).toBe(true);
    for (const name of ['receive', 'catchup', 'subscribe']) {
      expect(Object.hasOwn(subscriber, name)).toBe(false);
      expect(typeof Object.getPrototypeOf(subscriber)[name]).toBe('function');
    }
  });

  it('captures the first tip and commits full pages without chasing later appends', async () => {
    const { state, queue, receive, subscriber } = makeFixture();
    const getPage = queue.getPage.getMockImplementation()!;
    queue.getPage.mockImplementation(async request => {
      const result = await getPage(request);
      state.rows.push({ index: state.rows.length + 1, payload: 'new' });
      return result;
    });
    expect(await subscriber.catchup()).toEqual(encodeSuccess(undefined));
    expect(state.cursor).toBe(5);
    expect(queue.getPage.mock.calls.map(([request]) => request)).toEqual([
      { afterIndex: 0 },
      { afterIndex: 2, maxIndex: 5 },
      { afterIndex: 4, maxIndex: 5 },
    ]);
    expect(receive.mock.calls.map(([delivery]) => delivery.lastIndex)).toEqual([
      5, 6, 7,
    ]);
    expect(state.applied).toEqual(state.rows.slice(0, 5));
  });

  it('uses an explicit destination and skips a destination already committed', async () => {
    const { state, queue, subscriber } = makeFixture();
    expect(await subscriber.catchup(3)).toEqual(encodeSuccess(undefined));
    expect(state.cursor).toBe(3);
    expect(
      queue.getPage.mock.calls.map(([request]) => request.maxIndex),
    ).toEqual([3, 3]);
    queue.getPage.mockClear();
    expect(await subscriber.catchup(3)).toEqual(encodeSuccess(undefined));
    expect(queue.getPage).not.toHaveBeenCalled();
  });

  it('subscribes empty history at the genesis cursor', async () => {
    const { state, queue, subscriber } = makeFixture();
    state.rows = [];
    expect(await subscriber.subscribe()).toEqual(encodeSuccess(undefined));
    expect(queue.subscribe).toHaveBeenCalledWith({
      subscriberId: 'subscriber-a',
      currentIndex: null,
    });
  });

  it('enrolls the committed page tail and accepts rows appended during handoff', async () => {
    const { state, queue, subscriber } = makeFixture();
    queue.subscribe.mockImplementation(async request => {
      expect(request.currentIndex).toBe(5);
      const next = { index: 6, payload: 'during-enrollment' };
      state.rows.push(next);
      expect(await subscriber.receive({ rows: [next], lastIndex: 6 })).toEqual(
        encodeSuccess(undefined),
      );
      return encodeSuccess(undefined);
    });
    expect(await subscriber.subscribe()).toEqual(encodeSuccess(undefined));
    expect(state.cursor).toBe(6);
    expect(state.applied).toEqual(state.rows);
  });

  it('allows overlapping push to advance past an in-flight pulled page', async () => {
    const { state, queue, subscriber } = makeFixture();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const getPage = queue.getPage.getMockImplementation()!;
    queue.getPage.mockImplementationOnce(async request => {
      const result = await getPage(request);
      entered.resolve();
      await resume.promise;
      return result;
    });
    const caughtUp = subscriber.catchup();
    await entered.promise;
    expect(
      await subscriber.receive({ rows: state.rows.slice(0, 3), lastIndex: 5 }),
    ).toEqual(encodeSuccess(undefined));
    resume.resolve();
    expect(await caughtUp).toEqual(encodeSuccess(undefined));
    expect(state.cursor).toBe(5);
    expect(state.applied).toEqual(state.rows);
  });

  it('resumes committed progress after interruption and does not enroll failed catch-up', async () => {
    const { state, queue, receive, props, subscriber } = makeFixture();
    const apply = receive.getMockImplementation()!;
    receive.mockImplementationOnce(delivery => apply(delivery));
    receive.mockImplementationOnce(() =>
      Effect.fail(
        new ZerospinError({
          code: 'interrupted',
          message: 'Interrupted after first page',
        }),
      ),
    );
    expect(await subscriber.subscribe()).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'interrupted' },
    });
    expect(state.cursor).toBe(2);
    expect(queue.subscribe).not.toHaveBeenCalled();
    const reopened = makeFanoutSubscriber(props);
    expect(await reopened.subscribe()).toEqual(encodeSuccess(undefined));
    expect(state.applied).toEqual(state.rows);
    expect(queue.subscribe).toHaveBeenLastCalledWith({
      subscriberId: 'subscriber-a',
      currentIndex: 5,
    });
  });

  it('propagates source and terminal enrollment failures without clearing them', async () => {
    const { queue, subscriber } = makeFixture();
    const failure = encodeFailure(
      new ZerospinError({ code: 'source-failed', message: 'Unavailable' }),
    );
    queue.getPage.mockResolvedValueOnce(failure);
    expect(await subscriber.subscribe()).toEqual(failure);
    expect(queue.subscribe).not.toHaveBeenCalled();
    const terminal = encodeFailure(
      new ZerospinError({
        code: 'fanout-subscriber-failed',
        message: 'Retained failure',
      }),
    );
    queue.subscribe.mockResolvedValue(terminal);
    expect(await subscriber.subscribe()).toEqual(terminal);
    expect(await subscriber.subscribe()).toEqual(terminal);
  });

  it('reports unavailable history below the requested destination', async () => {
    const { queue, subscriber } = makeFixture();
    queue.getPage.mockResolvedValue(encodeSuccess({ rows: [], lastIndex: 5 }));
    expect(await subscriber.subscribe()).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'fanout-catchup-history-missing' },
    });
    expect(queue.getPage).toHaveBeenCalledTimes(1);
    expect(queue.subscribe).not.toHaveBeenCalled();
  });

  it('fails when receive acknowledges without making durable progress', async () => {
    const { receive, queue, subscriber } = makeFixture();
    receive.mockReturnValue(Effect.void);
    expect(await subscriber.subscribe()).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'fanout-catchup-no-progress' },
    });
    expect(queue.getPage).toHaveBeenCalledTimes(1);
    expect(queue.subscribe).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid destination %s',
    async index => {
      const { queue, subscriber } = makeFixture();
      expect(await subscriber.catchup(index)).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'fanout-catchup-index-invalid' },
      });
      expect(queue.getPage).not.toHaveBeenCalled();
    },
  );

  it('keeps two bound sources and their cursors independent', async () => {
    const a = makeFixture('a');
    const b = makeFixture('b');
    await a.subscriber.catchup(4);
    await b.subscriber.catchup(2);
    expect(a.state.cursor).toBe(4);
    expect(b.state.cursor).toBe(2);
    expect(a.getRepo).toHaveBeenCalledWith({ key: { sourceId: 'a' } });
    expect(b.getRepo).toHaveBeenCalledWith({ key: { sourceId: 'b' } });
  });

  it('waits for durable receive before acknowledging', async () => {
    const { state, props, receive } = makeFixture();
    const committed = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    receive.mockImplementation(delivery =>
      Effect.gen(function* () {
        entered.resolve();
        yield* Effect.promise(() => committed.promise);
        state.cursor = delivery.rows.at(-1)?.index ?? state.cursor;
      }),
    );
    const subscriber = makeFanoutSubscriber(props);
    let acknowledged = false;
    const result = subscriber
      .receive({ rows: state.rows.slice(0, 2), lastIndex: 5 })
      .then(value => {
        acknowledged = true;
        return value;
      });
    await entered.promise;
    expect(acknowledged).toBe(false);
    committed.resolve();
    expect(await result).toEqual(encodeSuccess(undefined));
    expect(state.cursor).toBe(2);
  });
});
