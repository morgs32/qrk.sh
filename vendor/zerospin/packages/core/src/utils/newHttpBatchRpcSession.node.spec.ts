import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { IAnyErrorJson } from '@zerospin/error';
import {
  newHttpBatchRpcResponse,
  newHttpBatchRpcSession,
  RpcTarget,
} from 'capnweb';
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
  it,
  vi,
} from 'vitest';

import { encodeRpc } from './encodeRpc.ts';

const TEST_RPC_URL = 'http://127.0.0.1:59999/rpc';

class ApiA extends RpcTarget {
  declare [Brand.BrandTypeId]: { readonly TargetApi: 'TargetApi' };
  hello(): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return Effect.runPromise(Effect.succeed('world').pipe(encodeRpc));
  }
}

class ApiB extends RpcTarget {
  declare [Brand.BrandTypeId]: { readonly TargetApi: 'TargetApi' };
  hello(): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return Effect.runPromise(Effect.succeed('world').pipe(encodeRpc));
  }
}

class Apis extends RpcTarget {
  ApiA() {
    return new ApiA();
  }

  ApiB() {
    return new ApiB();
  }
}

let postCount = 0;
let lastRequestUrl: string | undefined;

const apiHandlers = [
  http.post(TEST_RPC_URL, async ({ request }) => {
    postCount += 1;
    lastRequestUrl = request.url;
    return newHttpBatchRpcResponse(request as Request, new Apis());
  }),
];

const server = setupServer();

describe('newHttpBatchRpcSession (MSW + capnweb batch)', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
    postCount = 0;
    lastRequestUrl = undefined;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    server.use(...apiHandlers);
  });

  it('Effect.gen + using keeps the session until after the first batch when we sleep past the macrotask', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        using apis = newHttpBatchRpcSession<Apis>(TEST_RPC_URL);
        const stub = apis.ApiA();
        const result = yield* makeAsync(async () => stub.hello());
        expect(result).toEqual({ _tag: 'Right', right: 'world' });
      }).pipe(Effect.provide(AsyncLive)),
    );
    await vi.waitFor(() => {
      expect(postCount).toBeGreaterThan(0);
    });
    expect(lastRequestUrl).toBe(TEST_RPC_URL);
  });
});
