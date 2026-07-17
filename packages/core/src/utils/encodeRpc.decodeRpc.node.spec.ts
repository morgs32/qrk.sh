import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { IAnyErrorJson, ZerospinError } from '@zerospin/error';
import { newHttpBatchRpcResponse, RpcTarget } from 'capnweb';
import { Brand, Cause, Effect, Either, Exit, Option, Schema } from 'effect';
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

function assertDecodedZerospinError(left: unknown) {
  expect(ZerospinError.isZerospinError(left)).toBe(true);
  expect(left).toBeInstanceOf(ZerospinError);
  if (!ZerospinError.isZerospinError(left)) {
    return;
  }
  expect(left.code).toBe(expectedError.code);
  expect(left.message).toBe(
    'failed-to-get-namespace-system-worker: Worker not found.',
  );
  expect(left.rawMessage).toBe(expectedError.rawMessage);
  expect(left.status).toBe(expectedError.status);
  expect(left.extra).toEqual(expectedError.extra);
  expect(Reflect.get(left, Brand.BrandTypeId)).toBeUndefined();
  expect(typeof (left as { fail?: unknown }).fail).toBe('undefined');
  expect(typeof (left as { hello?: unknown }).hello).toBe('undefined');
}

class FailingApi extends RpcTarget {
  declare [Brand.BrandTypeId]: 'TargetApi';

  fail(): Promise<Schema.EitherEncoded<string, IAnyErrorJson>> {
    return Effect.runPromise(expectedError.pipe(encodeRpc));
  }
}

class Apis extends RpcTarget {
  declare [Brand.BrandTypeId]: 'Apis';

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
    it('decodeRpc Left is a ZerospinError instance, not a stub', async () => {
      const encoded = await Effect.runPromise(expectedError.pipe(encodeRpc));

      const maybeDecoded = await Effect.runPromise(
        decodeRpc(encoded).pipe(Effect.either),
      );
      expect(Either.isLeft(maybeDecoded)).toBe(true);
      if (Either.isLeft(maybeDecoded)) {
        assertDecodedZerospinError(maybeDecoded.left);
      }
    });

    it.effect('decodeRpc failure channel is a ZerospinError instance', () =>
      Effect.gen(function* () {
        const encoded = yield* expectedError.pipe(encodeRpc);
        const exit = yield* decodeRpc(encoded).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        const failure = Cause.failureOption(exit.cause);
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
          const failure = Cause.failureOption(exit.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            assertDecodedZerospinError(failure.value);
            expect(Cause.originalError(failure.value)).toEqual(failure.value);
          }
        }),
    );
  });

  describe('MSW + capnweb batch', () => {
    beforeEach(() => {
      server.use(...apiHandlers);
    });

    it('decoded RPC Left is a ZerospinError instance, not an RpcStub', async () => {
      using apis = newSyncRpcSession<Apis>(TEST_RPC_URL);
      const api = apis.getFailingApi();
      const encoded = await api.fail();
      expect(encoded._tag).toBe('Left');
      if (encoded._tag === 'Left') {
        expect(encoded.left.code).toBe(expectedError.code);
        expect(encoded.left.message).toBe(expectedError.rawMessage);
      }

      const maybeDecoded = await Effect.runPromise(
        decodeRpc(encoded).pipe(Effect.either),
      );
      expect(Either.isLeft(maybeDecoded)).toBe(true);
      if (Either.isLeft(maybeDecoded)) {
        assertDecodedZerospinError(maybeDecoded.left);
      }
      expect(typeof api.fail).toBe('function');
      if (Either.isLeft(maybeDecoded)) {
        expect(maybeDecoded.left).not.toBe(api);
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
          const failure = Cause.failureOption(exit.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            assertDecodedZerospinError(failure.value);
          }
        }).pipe(Effect.provide(AsyncLive)),
    );
  });
});
