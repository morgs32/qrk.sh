import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { type IAnyErrorJson, type IEncodedResult } from '@zerospin/error';
import { newHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Effect, Schema } from 'effect';
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
import { encodeSuccess } from './encodeSuccess.ts';
import { newSyncRpcSession } from './newSyncRpcSession.ts';

const TEST_RPC_URL = 'http://127.0.0.1:59999/rpc';

class ApiA extends RpcTarget {
  async hello(): Promise<IEncodedResult<string, IAnyErrorJson>> {
    return encodeSuccess('Api A');
  }
}

class ApiB extends RpcTarget {
  async hello(): Promise<IEncodedResult<string, IAnyErrorJson>> {
    return encodeSuccess('Api B');
  }
}

const datedClaims = Schema.Struct({
  aggregateId: Schema.String,
  issuedAt: Schema.DateFromString,
});
class ClaimsApi extends RpcTarget {
  authenticate(signature: typeof datedClaims.Type) {
    const decoded = Schema.decodeUnknownSync(Schema.toType(datedClaims))(
      signature,
    );
    const persisted = Schema.encodeSync(datedClaims)(decoded);
    return encodeSuccess(
      Schema.decodeUnknownSync(datedClaims)(
        JSON.parse(JSON.stringify(persisted)),
      ),
    );
  }
}

class Apis extends RpcTarget {
  aggregate() {
    return new ClaimsApi();
  }
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

  it('round trips decoded Date signatures and claims through the HTTP batch codec', async () => {
    server.use(...apiHandlers);
    using apis = newSyncRpcSession<Apis>(TEST_RPC_URL);
    const issuedAt = new Date('2026-09-18T12:00:00.000Z');
    const claims = await Effect.runPromise(
      decodeRpc(
        await apis
          .aggregate()
          .authenticate({ aggregateId: 'acct_dates', issuedAt }),
      ),
    );
    expect(claims.issuedAt).toBeInstanceOf(Date);
    expect(claims).toEqual({ aggregateId: 'acct_dates', issuedAt });
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
