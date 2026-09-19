import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeAggregateVersion';
import {
  aggregateFrontendProps,
  serviceFrontendProps,
} from '@zerospin/core/fixtures/frontendProps';
import {
  Item,
  List,
  main,
  User,
  userAggregate,
} from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeService } from '@zerospin/core/service/makeService';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import type { IAnyError } from '@zerospin/error';
import { Effect, type Layer } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeAggregateFrontend } from './makeAggregateFrontend/makeAggregateFrontend';
import { makeBackup } from './makeBackup/makeBackup';
import { makeRuntime } from './makeRuntime/makeRuntime';
import { makeServiceFrontend } from './makeServiceFrontend/makeServiceFrontend';
import { makeSession } from './makeSession/makeSession';
import { useInitializeSession } from './useInitializeSession/useInitializeSession';

declare const layer: Layer.Layer<PublishableKey | ZerospinApiUrl, IAnyError>;
declare const backup: ReturnType<typeof makeBackup>;

const userV1 = makeAggregateVersion(defineAggregate({ name: 'user' }), {
  ...userAggregate.authentication,
  version: '1.0.0',
  models: main.models,
  contracts: main.contracts,
  selections: {},
});
const userV2 = makeAggregateVersion(defineAggregate({ name: 'user' }), {
  ...userAggregate.authentication,
  version: '2.0.0',
  models: { user: User },
  contracts: {},
  selections: {},
});
const catalog = makeService({
  ...userAggregate.authentication,
  name: 'catalog',
  version: '1.0.0',
  models: { user: User, list: List, item: Item },
  contracts: {},
});
const catalogV2 = makeService({
  ...userAggregate.authentication,
  name: 'catalog',
  version: '2.0.0',
  models: { user: User },
  contracts: {},
});
const system = makeSystem({
  name: 'system-worker',
  aggregates: { user: [userV1, userV2] },
  services: { catalog: [catalog, catalogV2] },
});
const emptySystem = makeSystem({
  name: 'system-worker',
  aggregates: {},
  services: {},
});
const otherSystem = makeSystem({
  name: 'other',
  aggregates: { user: [userV1] },
  services: {},
});

const runtime = makeRuntime({ layer });
const Main = makeAggregateFrontend(aggregateFrontendProps(main));
assert<Equals<typeof Main.models, typeof main.models>>();

const subset = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'subset',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  models: { user: User, list: List },
  contracts: { createList: main.contracts.createList },
});
const second = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'second',
  aggregateName: 'user',
  aggregateVersion: '2.0.0',
  models: { user: User },
  contracts: {},
});
const products = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'products',
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
  models: catalog.models,
});
const productsV2 = makeFrontendController({
  authenticationSchema: main.authentication.authenticationSchema,
  systemName: 'system-worker',
  name: 'productsV2',
  serviceName: 'catalog',
  serviceVersion: '2.0.0',
  models: { user: User },
});

const MainSession = makeSession({
  frontend: Main,
  runtime,
  backup,
  systemName: 'system-worker',
});
const SubsetSession = makeSession({
  frontend: makeAggregateFrontend(aggregateFrontendProps(subset)),
  runtime,
  backup,
  systemName: 'system-worker',
});
const SecondSession = makeSession({
  frontend: makeAggregateFrontend(aggregateFrontendProps(second)),
  runtime,
  backup,
  systemName: 'system-worker',
});
const ProductsSession = makeSession({
  frontend: makeServiceFrontend(serviceFrontendProps(products)),
  runtime,
  backup,
  systemName: 'system-worker',
});
const ProductsV2Session = makeSession({
  frontend: makeServiceFrontend(serviceFrontendProps(productsV2)),
  runtime,
  backup,
  systemName: 'system-worker',
});
const ProductsSubsetSession = makeSession({
  frontend: makeServiceFrontend(
    serviceFrontendProps({ ...products, models: { user: User } }),
  ),
  runtime,
  backup,
  systemName: 'system-worker',
});

void MainSession.initialize<typeof system>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
void SubsetSession.initialize<typeof system>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
void SecondSession.initialize<typeof system>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
void ProductsSession.initialize<typeof system>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
void ProductsV2Session.initialize<typeof system>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
void ProductsSubsetSession.initialize<typeof system>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

MainSession.initialize<typeof emptySystem>({
  // @ts-expect-error Empty registries cannot admit aggregates.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
ProductsSession.initialize<typeof emptySystem>({
  // @ts-expect-error Empty registries cannot admit services.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

const WrongNameSession = makeSession({
  frontend: Main,
  runtime,
  backup,
  systemName: 'other',
});
WrongNameSession.initialize<typeof system>({
  // @ts-expect-error Session systemName must match SYSTEM.name.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});
WrongNameSession.initialize<typeof otherSystem>({
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

const MissingAggregateSession = makeSession({
  frontend: makeAggregateFrontend(
    aggregateFrontendProps({ ...main, aggregateName: 'missing' }),
  ),
  runtime,
  backup,
  systemName: 'system-worker',
});
MissingAggregateSession.initialize<typeof system>({
  // @ts-expect-error Unknown aggregate.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

const MissingServiceSession = makeSession({
  frontend: makeServiceFrontend(
    serviceFrontendProps({ ...products, serviceName: 'missing' }),
  ),
  runtime,
  backup,
  systemName: 'system-worker',
});
MissingServiceSession.initialize<typeof system>({
  // @ts-expect-error Unknown service.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

const UnknownAggregateVersionSession = makeSession({
  frontend: makeAggregateFrontend(
    aggregateFrontendProps({ ...main, aggregateVersion: '3.0.0' }),
  ),
  runtime,
  backup,
  systemName: 'system-worker',
});
UnknownAggregateVersionSession.initialize<typeof system>({
  // @ts-expect-error Unknown aggregate version.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

const UnknownServiceVersionSession = makeSession({
  frontend: makeServiceFrontend(
    serviceFrontendProps({ ...products, serviceVersion: '3.0.0' }),
  ),
  runtime,
  backup,
  systemName: 'system-worker',
});
UnknownServiceVersionSession.initialize<typeof system>({
  // @ts-expect-error Unknown service version.
  generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
});

MainSession.initialize<typeof system>({
  generateSignature: () =>
    // @ts-expect-error Signatures retain their decoded schema type.
    Effect.succeed({ userId: 1 }),
});

function CompatibleHook() {
  useInitializeSession<typeof system>({
    session: MainSession,
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  useInitializeSession<typeof system>({
    session: ProductsSession,
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  return null;
}
void CompatibleHook;

function IncompatibleHooks() {
  useInitializeSession<typeof emptySystem>({
    // @ts-expect-error Empty registries cannot admit aggregates.
    session: MainSession,
    // @ts-expect-error Empty registries cannot admit aggregates.
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  useInitializeSession<typeof emptySystem>({
    // @ts-expect-error Empty registries cannot admit services.
    session: ProductsSession,
    // @ts-expect-error Empty registries cannot admit services.
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  useInitializeSession<typeof system>({
    // @ts-expect-error Session systemName must match SYSTEM.name.
    session: WrongNameSession,
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  useInitializeSession<typeof system>({
    session: MainSession,
    // @ts-expect-error Signatures retain their decoded schema type.
    generateSignature: () => Effect.succeed({ userId: 1 }),
  });
  useInitializeSession<typeof system>({
    // @ts-expect-error Unknown aggregate.
    session: MissingAggregateSession,
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  useInitializeSession<typeof system>({
    // @ts-expect-error Unknown service.
    session: MissingServiceSession,
    generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
  });
  return null;
}
void IncompatibleHooks;
