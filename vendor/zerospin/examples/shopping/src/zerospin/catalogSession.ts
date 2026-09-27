import { makeSession } from '@zerospin/browser';

import { applicationLayer } from './applicationLayer';
import { clerkCredentialsSchema, userClaims } from './claims';
import { productV1 } from './services/app/models/product/ProductV1';

export const catalogSession = makeSession({
  sharedWorker: ({ name }) =>
    new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), {
      type: 'module',
      name,
    }),
  claimsSchema: userClaims,
  credentialsSchema: clerkCredentialsSchema,
  kind: 'service',
  actorName: 'default',
  actorVersion: '1.0.0',
  serviceVersion: '1.0.0',
  serviceName: 'app',
  sessionName: 'appSession',
  models: { product: productV1 },
  contracts: {},
  automations: {},
  layer: applicationLayer,
  systemName: 'shopping',
});
