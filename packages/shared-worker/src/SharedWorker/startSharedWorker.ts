import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import type { IAnyError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { newMessagePortRpcSession } from 'capnweb';
import { Layer, ManagedRuntime, Redacted, Schema } from 'effect';

import type { makeIdbSQLite3 } from '../drizzle/makeIdbSQLite3.ts';
import type { IAsyncWaSqliteDrizzleDb } from '../drizzle/types.ts';

import { type AggregateFrontendReplicaRepo } from './AggregateFrontendReplicaRepo/AggregateFrontendReplicaRepo.ts';
import { type ServiceFrontendReplicaRepo } from './ServiceFrontendReplicaRepo/ServiceFrontendReplicaRepo.ts';
import { SharedWorkerApi } from './SharedWorkerApi/SharedWorkerApi.ts';
import type { userReplicaDbConfig } from './userReplicaSchemas.ts';

const sharedWorkerHostDefaultRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

export function startSharedWorker(
  props: {
    runtime?: ManagedRuntime.ManagedRuntime<
      CuidFactory | MonotonicFactory,
      IAnyError
    >;
  } = {},
): void {
  const { runtime = sharedWorkerHostDefaultRuntime } = props;

  const locationUrl = new URL(globalThis.location.href);

  const rawApiUrl = locationUrl.searchParams.get('apiUrl');
  const rawPublishableKey = locationUrl.searchParams.get('publishableKey');
  const rawWasmUrl = locationUrl.searchParams.get('wasmUrl');

  if (rawApiUrl === null || rawPublishableKey === null || rawWasmUrl === null) {
    throw new Error(
      'SharedWorker URL is missing apiUrl, publishableKey, or wasmUrl search params',
    );
  }

  const sharedWorkerApiUrl = Schema.decodeUnknownSync(Schema.NonEmptyString)(
    rawApiUrl,
  );
  const sharedWorkerPublishableKey = Schema.decodeUnknownSync(
    Schema.NonEmptyString,
  )(rawPublishableKey);
  const sharedWorkerWasmUrl = Schema.decodeUnknownSync(Schema.NonEmptyString)(
    rawWasmUrl,
  );
  new URL(sharedWorkerApiUrl);
  new URL(sharedWorkerWasmUrl);
  const authenticationRuntime = ManagedRuntime.make(
    Layer.mergeAll(
      AsyncLive,
      Layer.succeed(ZerospinApiUrl, sharedWorkerApiUrl),
      Layer.succeed(PublishableKey, Redacted.make(sharedWorkerPublishableKey)),
      makeTelemetryLayer(makeTelemetryCollector()),
    ),
  );

  let nextRegistrationId = 0;

  const userReplicaStores = new Map<
    string,
    {
      userId: string;
      userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
      systemId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    }
  >();

  const userReplicaOpenPromises = new Map<
    string,
    Promise<{
      userId: string;
      userReplicaSqlite: Awaited<ReturnType<typeof makeIdbSQLite3>>;
      db: IAsyncWaSqliteDrizzleDb<typeof userReplicaDbConfig>;
      systemId: string;
      vfsName: string;
      acquisitionTail: Promise<void>;
    }>
  >();

  const aggregateReplicaRuntimes = new Map<
    string,
    AggregateFrontendReplicaRepo
  >();
  const serviceReplicaRuntimes = new Map<string, ServiceFrontendReplicaRepo>();
  const allocateRegistrationId = (): number => {
    nextRegistrationId += 1;
    return nextRegistrationId;
  };

  globalThis.addEventListener('connect', event => {
    if (!(event instanceof MessageEvent)) return;
    const port = event.ports[0];
    if (!(port instanceof MessagePort)) return;

    const ownerToken = {};
    const localApi = new SharedWorkerApi({
      ownerToken,
      runtime,
      authenticationRuntime,
      sharedWorkerWasmUrl,
      sharedWorkerApiUrl,
      sharedWorkerPublishableKey,
      userReplicaStores,
      userReplicaOpenPromises,
      aggregateReplicaRuntimes,
      serviceReplicaRuntimes,
      allocateRegistrationId,
    });
    port.start();
    newMessagePortRpcSession(port, localApi);

    const releasePortRegistrations = () => {
      localApi[Symbol.dispose]();
    };
    port.addEventListener('messageerror', releasePortRegistrations, {
      once: true,
    });
    port.addEventListener('close', releasePortRegistrations, { once: true });
  });
}
