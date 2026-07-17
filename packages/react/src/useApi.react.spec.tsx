import { act, createContext, useEffect } from 'react';

import type {
  IActorController,
  IServiceQuery,
} from '@zerospin/core/actorController/types';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import type { IAnyError } from '@zerospin/error';
import { makeTelemetryCollector } from '@zerospin/logger';
import type * as Capnweb from 'capnweb';
import {
  Effect,
  Either,
  Layer,
  ManagedRuntime,
  Redacted,
  Schema,
} from 'effect';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IBrowserSession, IReactSessionContext } from './types';
import { useApi } from './useApi';

const newHttpBatchRpcSessionMock = vi.hoisted(() => vi.fn());
const getFrontendApi = vi.hoisted(() => vi.fn());
const executeActorQuery = vi.hoisted(() => vi.fn());

vi.mock('capnweb', async importOriginal => {
  const actual = await importOriginal<typeof Capnweb>();
  return {
    ...actual,
    newHttpBatchRpcSession: newHttpBatchRpcSessionMock,
  };
});

const frontend = makeFrontendController({
  contracts: {},
  models: {},
  accountName: 'user',
  actorName: 'shopper',
  frontendName: 'web',
  version: '1.0.0',
  systemName: 'react-use-api-test',
  signature: Schema.Struct({}),
});

const paramsSchema = Schema.Struct({
  limit: Schema.Number,
});

const ReactContext = createContext<IReactSessionContext<
  typeof frontend
> | null>(null);

const sessionRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    AsyncLive,
    NanoIdFactory,
    UlidMonotonicFactory,
    Layer.succeed(PublishableKey, Redacted.make('pk_test')),
    Layer.succeed(ZerospinApisUrl, 'https://api.example.com'),
  ),
);

const ReactSession = {
  frontend,
  ReactContext,
  sessionRuntime,
};

function UseApiProbe(props: {
  onResult: (result: Either.Either<{ total: number }, IAnyError>) => void;
}) {
  const { onResult } = props;
  const api = useApi<
    IActorController<'shopper'> & {
      api: {
        getProducts: IServiceQuery<
          'getProducts',
          {},
          typeof paramsSchema,
          { total: number }
        >;
      };
    }
  >(ReactSession);

  useEffect(() => {
    void api
      .executeActorQuery({
        queryName: 'getProducts',
        params: {
          limit: 7,
        },
      })
      .then(onResult);
  }, [api, onResult]);

  return null;
}

describe('useApi', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    executeActorQuery.mockResolvedValue({
      result: encodeRight({ total: 7 }),
      link: null,
    });
    getFrontendApi.mockReturnValue({
      executeActorQuery,
    });
    newHttpBatchRpcSessionMock.mockReturnValue({
      getFrontendApi,
      [Symbol.dispose]: () => {
        /* Rpc session dispose (no-op in tests). */
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('calls executeActorQuery through the session frontend API and decodes the result', async () => {
    const onResult = vi.fn();
    const coreSession = {
      frontend,
      generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
      sessionId: 'sesn_1',
      store: {
        getState: () => ({
          isInitialized: true,
          telemetryCollector: makeTelemetryCollector(),
        }),
      },
    };
    const session = {
      ...coreSession,
      coreSession,
    } as IBrowserSession<typeof frontend>;

    await act(async () => {
      root.render(
        <ReactContext.Provider value={{ session }}>
          <UseApiProbe onResult={onResult} />
        </ReactContext.Provider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(Either.right({ total: 7 }));
    });
    expect(newHttpBatchRpcSessionMock).toHaveBeenCalledWith(
      'https://api.example.com',
    );
    expect(getFrontendApi).toHaveBeenCalledWith({
      publishableKey: 'pk_test',
      accountName: 'user',
      actorName: 'shopper',
      frontendName: 'web',
      signature: {
        userId: 'usr_1',
      },
    });
    expect(executeActorQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          {
            queryName: 'getProducts',
            params: {
              limit: 7,
            },
          },
        ],
        traceContext: expect.objectContaining({
          traceId: expect.any(String),
          parentSpanId: expect.any(String),
        }),
      }),
    );
  });
});
