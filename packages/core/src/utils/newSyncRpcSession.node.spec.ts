import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { IAnyErrorJson } from '@zerospin/error';
import { newHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Brand, Effect, Schema } from 'effect';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
} from 'vitest';

import { decodeRpc } from './decodeRpc.ts';
import { encodeRight } from './encodeRight.ts';
import { newSyncRpcSession } from './newSyncRpcSession.ts';

const TEST_RPC_URL = 'http://127.0.0.1:59999/rpc';

class ApiA extends RpcTarget {
  declare [Brand.BrandTypeId]: 'TargetApi';
  async hello(): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return encodeRight('Api A');
  }
}

class ApiB extends RpcTarget {
  declare [Brand.BrandTypeId]: 'TargetApi';
  async hello(): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return encodeRight('Api B');
  }
}

class Apis extends RpcTarget {
  declare [Brand.BrandTypeId]: 'Apis';
  getApiA() {
    return new ApiA();
  }

  getApiB() {
    return new ApiB();
  }
}

const apiHandlers = [
  http.post(TEST_RPC_URL, async ({ request }) => {
    return newHttpBatchRpcResponse(request as Request, new Apis());
  }),
];

const server = setupServer();

describe('newSyncRpcSession (MSW + capnweb batch)', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe('async usage', () => {
    beforeEach(() => {
      server.use(...apiHandlers);
    });

    /**
     * Async RPC must run inside `use` so the batch session stays open until `hello()` completes.
     * Returning the stub alone disposes the session on sync return — `await stub.hello()` then hits a
     * shut-down session.
     */
    it('decodes hello via decodeRpc while session is held (use callback)', async () => {
      using apis = newSyncRpcSession<Apis>(TEST_RPC_URL);
      const api = apis.getApiA();
      const result = await Effect.runPromise(decodeRpc(await api.hello()));
      expect(result).toBe('Api A');
    });
  });

  describe('Effect usage', () => {
    beforeEach(() => {
      server.use(...apiHandlers);
    });

    /**
     * Returning an `RpcStub` (Disposable) from `Effect.gen` makes Effect finalize the fiber result
     * and dispose the stub again after `using apis` has already shut the session — capnweb throws.
     * Here `fn` resolves to an encoded primitive after awaiting the live MSW-backed RPC stub.
     */
    it.effect(
      'exposes an Effect whose fn invokes the RpcStub against MSW',
      () =>
        Effect.gen(function* () {
          using apis = newSyncRpcSession<Apis>(TEST_RPC_URL);
          const api = apis.getApiA();
          const result = yield* makeAsync(() => api.hello()).pipe(
            Effect.flatMap(decodeRpc),
          );
          expect(result).toBe('Api A');
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
