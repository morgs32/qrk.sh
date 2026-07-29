import { main } from '@zerospin/core/fixtures/system';
import { makeServiceFrontendController } from '@zerospin/core/serviceFrontendController/makeServiceFrontendController';
import { Effect, Schema } from 'effect';

import { ZerospinConfig } from './ZerospinConfig';
import { makeReactFrontend } from './makeReactFrontend';
import { makeReactServiceFrontend } from './makeReactServiceFrontend';

const ReactMain = makeReactFrontend({
  frontend: main,
});

const catalog = makeServiceFrontendController({
  systemName: 'system-worker',
  serviceName: 'catalog',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  models: {},
  signature: Schema.Struct({}),
});

const ReactCatalog = makeReactServiceFrontend({
  frontend: catalog,
});

const exactRegistry = (
  <ZerospinConfig
    partitionKey="partition_exact_registry"
    frontendAuthenticators={{
      main: {
        frontend: ReactMain,
        generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
      },
      catalog: {
        frontend: ReactCatalog,
        generateSignature: () => Effect.succeed({ viewerId: 'usr_1' }),
      },
    }}
  >
    {null}
  </ZerospinConfig>
);
void exactRegistry;

const mismatchedRegistry = (
  <ZerospinConfig
    partitionKey="partition_mismatched_registry"
    frontendAuthenticators={{
      // @ts-expect-error — registry key must equal the controller's literal frontendName.
      wrong: {
        frontend: ReactMain,
        generateSignature: () => Effect.succeed({ userId: 'usr_1' }),
      },
    }}
  >
    {null}
  </ZerospinConfig>
);
void mismatchedRegistry;
