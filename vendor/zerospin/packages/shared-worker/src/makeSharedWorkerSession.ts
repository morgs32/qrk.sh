import type { ISystemId } from '@zerospin/core/system/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { annotateFunctionSpan } from '@zerospin/logger';
import { newMessagePortRpcSession } from 'capnweb';
import { Effect } from 'effect';

export const makeSharedWorkerSession = Effect.fn('makeSharedWorkerSession')(
  function* (props: {
    systemId: ISystemId;
    generationId: string;
  }): Effect.fn.Return<
    {
      api: {
        getUserApi(props: { userId: string }): Promise<{
          listFrontendReplicas(): Promise<
            readonly {
              accountId: string;
              accountName: string;
              actorId: string;
              actorName: string;
              frontendName: string;
              frontendVersion: string;
              databaseName: string;
            }[]
          >;
        }>;
      };
      release: Effect.Effect<void>;
    },
    IAnyError
  > {
    const { systemId, generationId } = props;

    if (
      typeof globalThis.SharedWorker !== 'function' ||
      typeof globalThis.MessagePort !== 'function'
    ) {
      return yield* new ZerospinError({
        code: 'shared-worker-unavailable',
        message:
          'SharedWorker is not available; this browser is not compatible',
      });
    }

    return yield* Effect.tryPromise({
      try: async () => {
        const sharedWorkerAssetUrl = new URL(
          './sharedWorker.bundle.js',
          import.meta.url,
        );
        const sharedWorkerWasmAssetUrl = new URL(
          './wa-sqlite-async.wasm',
          import.meta.url,
        );

        // Turbopack replaces static asset URLs with a relative-URL shim whose
        // href does not change when its detached searchParams object is mutated.
        // Build the final string explicitly so the SharedWorker receives its
        // identity and emitted WASM URL in every bundler.
        const sharedWorkerUrl =
          `${sharedWorkerAssetUrl.href}?systemId=${encodeURIComponent(systemId)}` +
          `&generationId=${encodeURIComponent(generationId)}` +
          `&wasmUrl=${encodeURIComponent(sharedWorkerWasmAssetUrl.href)}`;

        const sharedWorker = new globalThis.SharedWorker(sharedWorkerUrl, {
          name: 'zerospin:shared-worker',
          type: 'module',
        });
        const port = sharedWorker.port;
        port.start();
        let api: ReturnType<
          typeof newMessagePortRpcSession<{
            getUserApi(props: { userId: string }): Promise<{
              listFrontendReplicas(): Promise<
                readonly {
                  accountId: string;
                  accountName: string;
                  actorId: string;
                  actorName: string;
                  frontendName: string;
                  frontendVersion: string;
                  databaseName: string;
                }[]
              >;
            }>;
          }>
        >;
        try {
          api = newMessagePortRpcSession<{
            getUserApi(props: { userId: string }): Promise<{
              listFrontendReplicas(): Promise<
                readonly {
                  accountId: string;
                  accountName: string;
                  actorId: string;
                  actorName: string;
                  frontendName: string;
                  frontendVersion: string;
                  databaseName: string;
                }[]
              >;
            }>;
          }>(port);
        } catch (cause) {
          port.close();
          throw cause;
        }

        return {
          api,
          release: Effect.sync(() => {
            api[Symbol.dispose]();
            port.close();
          }),
        };
      },
      catch: cause =>
        new ZerospinError({
          code: 'failed-to-connect-shared-worker',
          message: 'Failed to connect to shared worker',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
  },
  annotateFunctionSpan,
);
