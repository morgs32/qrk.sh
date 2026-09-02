import { it } from '@effect/vitest';
import { type IAnyErrorJson } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTelemetryLayer,
  type ILinkedRpcEnvelope,
  type IRpcRequest,
  type ITraceContext,
} from '@zerospin/logger';
import { newHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Effect } from 'effect';
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

import { encodeSuccess } from './encodeSuccess.ts';
import { executeRpc } from './executeRpc.ts';

const TEST_RPC_URL = 'http://127.0.0.1:59999/execute-rpc';
let apiATraceContext: ITraceContext | null | undefined;

class ApiA extends RpcTarget {
  async hello(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IAnyErrorJson>> {
    apiATraceContext = request.traceContext;
    return { result: encodeSuccess('Api A'), link: null };
  }
}

class ApiB extends RpcTarget {
  async hello(
    _request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IAnyErrorJson>> {
    return { result: encodeSuccess('Api B'), link: null };
  }
}

class Apis extends RpcTarget {
  getApiA() {
    return new ApiA();
  }

  getApiB() {
    return new ApiB();
  }
}

const server = setupServer();

describe('executeRpc', () => {
  let requestCount = 0;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  beforeEach(() => {
    requestCount = 0;
    apiATraceContext = undefined;
    server.use(
      http.post(TEST_RPC_URL, async ({ request }) => {
        requestCount += 1;
        return newHttpBatchRpcResponse(request as Request, new Apis());
      }),
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it.effect('executes all callback calls in one HTTP batch', () =>
    Effect.gen(function* () {
      const collector = makeTelemetryCollector();
      const [apiAResult, apiBResult] = yield* executeRpc<Apis>(TEST_RPC_URL)(
        apis =>
          Effect.all([apis.getApiA().hello(), apis.getApiB().hello()], {
            concurrency: 'unbounded',
          }),
      ).pipe(
        Effect.withSpan('executeRpc.test'),
        Effect.provide(makeTelemetryLayer(collector)),
      );

      expect(apiAResult).toBe('Api A');
      expect(apiBResult).toBe('Api B');
      expect(requestCount).toBe(1);
      expect(apiATraceContext).toEqual({
        traceId: expect.stringMatching(/^trc_/),
        parentSpanId: expect.stringMatching(/^spn_/),
      });
    }),
  );

  it.effect('maps an HTTP batch failure to async-failed', () => {
    server.use(
      http.post(TEST_RPC_URL, () => new Response(null, { status: 503 })),
    );

    return executeRpc<Apis>(TEST_RPC_URL)(apis => apis.getApiA().hello()).pipe(
      Effect.flip,
      Effect.map(error =>
        expect('code' in error ? error.code : null).toBe('async-failed'),
      ),
    );
  });

  it.effect('maps a synchronous callback failure to async-failed', () =>
    executeRpc<Apis>(TEST_RPC_URL)((): Effect.Effect<never> => {
      throw new Error('callback failed');
    }).pipe(
      Effect.flip,
      Effect.map(error => expect(error.code).toBe('async-failed')),
    ),
  );
});
