import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { newHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Cause, Effect, Exit, Option, Result } from 'effect';
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
import { encodeRpc } from './encodeRpc.ts';
import { newSyncRpcSession } from './newSyncRpcSession.ts';

const TEST_RPC_URL = 'http://127.0.0.1:59998/rpc';

const expectedError = new ZerospinError({
  code: 'failed-to-get-namespace-system-worker',
  message: 'Worker not found.',
  status: null,
  extra: null,
});

function assertDecodedZerospinError(failure: unknown) {
  expect(ZerospinError.isZerospinError(failure)).toBe(true);
  expect(failure).toBeInstanceOf(ZerospinError);
  if (!ZerospinError.isZerospinError(failure)) {
    return;
  }
  expect(failure.code).toBe(expectedError.code);
  expect(failure.message).toBe(
    'failed-to-get-namespace-system-worker: Worker not found.',
  );
  expect(failure.rawMessage).toBe(expectedError.rawMessage);
  expect(failure.status).toBe(expectedError.status);
  expect(failure.extra).toEqual(expectedError.extra);
  expect(typeof (failure as { fail?: unknown }).fail).toBe('undefined');
  expect(typeof (failure as { hello?: unknown }).hello).toBe('undefined');
}

class FailingApi extends RpcTarget {
  fail(): Promise<IEncodedResult<string, IAnyErrorJson>> {
    return Effect.runPromise(expectedError.pipe(encodeRpc));
  }
}

class Apis extends RpcTarget {
  getFailingApi() {
    return new FailingApi();
  }
}

const apiHandlers = [
  http.post(TEST_RPC_URL, async ({ request }) => {
    return newHttpBatchRpcResponse(request as Request, new Apis());
  }),
];

const server = setupServer();

describe('encodeRpc / decodeRpc (Node)', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe('in-process round trip', () => {
    it('encodes exact Success and Failure wire objects', async () => {
      await expect(
        Effect.runPromise(Effect.succeed('ok').pipe(encodeRpc)),
      ).resolves.toEqual({ _tag: 'Success', success: 'ok' });
      await expect(
        Effect.runPromise(expectedError.pipe(encodeRpc)),
      ).resolves.toEqual({
        _tag: 'Failure',
        failure: {
          cause: null,
          code: 'failed-to-get-namespace-system-worker',
          extra: null,
          message: 'Worker not found.',
          status: null,
        },
      });
    });

    it.effect('rejects legacy Left and Right envelopes', () =>
      Effect.gen(function* () {
        const leftExit = yield* decodeRpc(
          // @ts-expect-error legacy v3 wire envelope is intentionally unsupported
          { _tag: 'Left', left: expectedError },
        ).pipe(Effect.exit);
        const rightExit = yield* decodeRpc(
          // @ts-expect-error legacy v3 wire envelope is intentionally unsupported
          { _tag: 'Right', right: 'legacy' },
        ).pipe(Effect.exit);

        for (const exit of [leftExit, rightExit]) {
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            const failure = Cause.findErrorOption(exit.cause);
            expect(Option.isSome(failure)).toBe(true);
            if (Option.isSome(failure)) {
              expect(failure.value.code).toBe('failed-to-decode-rpc');
            }
          }
        }
      }),
    );

    it('decodeRpc Failure is a ZerospinError instance, not a stub', async () => {
      const encoded = await Effect.runPromise(expectedError.pipe(encodeRpc));

      const maybeDecoded = await Effect.runPromise(
        decodeRpc(encoded).pipe(Effect.result),
      );
      expect(Result.isFailure(maybeDecoded)).toBe(true);
      if (Result.isFailure(maybeDecoded)) {
        assertDecodedZerospinError(maybeDecoded.failure);
      }
    });

    it.effect('decodeRpc failure channel is a ZerospinError instance', () =>
      Effect.gen(function* () {
        const encoded = yield* expectedError.pipe(encodeRpc);
        const exit = yield* decodeRpc(encoded).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        if (!Exit.isFailure(exit)) {
          return;
        }
        const failure = Cause.findErrorOption(exit.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          assertDecodedZerospinError(failure.value);
        }
      }),
    );

    it.effect(
      'decodeRpc failure under span is not a Proxy-wrapped ZerospinError',
      () =>
        Effect.gen(function* () {
          const encoded = yield* Effect.gen(function* () {
            return yield* expectedError;
          }).pipe(encodeRpc);
          const exit = yield* Effect.withSpan('decodeRpc-test')(
            decodeRpc(encoded).pipe(Effect.exit),
          );
          expect(Exit.isFailure(exit)).toBe(true);
          if (!Exit.isFailure(exit)) {
            return;
          }
          const failure = Cause.findErrorOption(exit.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            assertDecodedZerospinError(failure.value);
          }
        }),
    );
  });

  describe('MSW + capnweb batch', () => {
    beforeEach(() => {
      server.use(...apiHandlers);
    });

    it('decoded RPC Failure is a ZerospinError instance, not an RpcStub', async () => {
      using apis = newSyncRpcSession<Apis>(TEST_RPC_URL);
      const api = apis.getFailingApi();
      const encoded = await api.fail();
      expect(encoded._tag).toBe('Failure');
      if (encoded._tag === 'Failure') {
        expect(encoded.failure.code).toBe(expectedError.code);
        expect(encoded.failure.message).toBe(expectedError.rawMessage);
      }

      const maybeDecoded = await Effect.runPromise(
        decodeRpc(encoded).pipe(Effect.result),
      );
      expect(Result.isFailure(maybeDecoded)).toBe(true);
      if (Result.isFailure(maybeDecoded)) {
        assertDecodedZerospinError(maybeDecoded.failure);
      }
      expect(typeof api.fail).toBe('function');
      if (Result.isFailure(maybeDecoded)) {
        expect(maybeDecoded.failure).not.toBe(api);
      }
    });

    it.effect(
      'Effect.flatMap(decodeRpc) after RPC stub resolves to typed failure',
      () =>
        Effect.gen(function* () {
          using apis = newSyncRpcSession<Apis>(TEST_RPC_URL);
          const api = apis.getFailingApi();
          const exit = yield* makeAsync(() => api.fail()).pipe(
            Effect.flatMap(decodeRpc),
            Effect.exit,
          );
          expect(Exit.isFailure(exit)).toBe(true);
          if (!Exit.isFailure(exit)) {
            return;
          }
          const failure = Cause.findErrorOption(exit.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            assertDecodedZerospinError(failure.value);
          }
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
