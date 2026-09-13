import { main, type system } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { ApiRequestInit } from '@zerospin/core/services/ApiRequestInit';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IAnyError } from '@zerospin/error';
import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeZerospinApp } from './makeZerospinApp';
import { useLiveQuery } from './useLiveQuery';
import { useSession } from './useSession';

declare const sessionRuntimeLayer: Layer.Layer<
  PublishableKey | ZerospinApiUrl,
  IAnyError
>;
const App = makeZerospinApp<typeof system>({
  systemName: 'system-worker',
  layer: sessionRuntimeLayer,
});
const Main = App.makeFrontend(main);
assert<Equals<typeof Main.frontend, typeof main>>();
assert<Equals<typeof Main.models, typeof main.models>>();
assert<
  Equals<typeof Main.frontend.contracts.createList.contract.version, '1.0.0'>
>();
const mounted = (
  <App.Provider>
    <Main generateSignature={() => Effect.succeed({ userId: 'usr_1' })}>
      {null}
    </Main>
  </App.Provider>
);
void mounted;
// @ts-expect-error A frontend requires its own signer.
const missingSignature = <Main>{null}</Main>;
void missingSignature;
const wrongSignature = (
  // @ts-expect-error Signatures retain their decoded schema type.
  <Main generateSignature={() => Effect.succeed({ userId: 1 })}>{null}</Main>
);
void wrongSignature;

const requiresRequestInit = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  name: 'request',
  models: {},
  contracts: {},
  layer: Layer.effect(
    CuidFactory,
    Effect.as(ApiRequestInit, () => Effect.succeed('id')),
  ),
});

// @ts-expect-error The app must provide frontend-local layer inputs.
App.makeFrontend(requiresRequestInit);
const withRequestInit = makeZerospinApp<typeof system, ApiRequestInit>({
  systemName: 'system-worker',
  layer: Layer.mergeAll(
    sessionRuntimeLayer,
    Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
  ),
});
withRequestInit.makeFrontend(requiresRequestInit);
const requiresGuardInput = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  name: 'guard-input',
  models: main.models,
  contracts: main.contracts,
  guardLayer: () =>
    Layer.effect(
      CuidFactory,
      Effect.as(ApiRequestInit, () => Effect.succeed('id')),
    ),
});
// @ts-expect-error Guard-layer inputs must be supplied by the application.
App.makeFrontend(requiresGuardInput);
withRequestInit.makeFrontend(requiresGuardInput);
makeZerospinApp<typeof system, ApiRequestInit>({
  systemName: 'system-worker',
  // @ts-expect-error Explicit application services must actually be supplied.
  layer: sessionRuntimeLayer,
});

function Consumer() {
  const session = useSession(Main);
  assert<Equals<typeof session.frontend, typeof main>>();
  useLiveQuery(Main, { query: db => db.query.list.findMany() });
  // @ts-expect-error The selected models do not contain this table.
  useLiveQuery(Main, { query: db => db.query.missing.findMany() });
  return null;
}
void Consumer;
