import { makeServiceSession } from '@zerospin/browser';

import { applicationLayer } from './applicationLayer';
import { clerkCredentialsSchema, userClaims } from './claims';
import { productV1 } from './services/marketplace/models/product/ProductV1';

export const catalogSession = makeServiceSession({
  sharedWorker: ({ name }) =>
    new SharedWorker(new URL('./zerospin.worker.ts', import.meta.url), {
      type: 'module',
      name,
    }),
  claimsSchema: userClaims,
  credentialsSchema: clerkCredentialsSchema,
  actorName: 'catalog',
  actorVersion: '1.0.0',
  serviceVersion: '1.0.0',
  serviceName: 'marketplace',
  sessionName: 'catalogSession',
  models: { product: productV1 },
  layer: applicationLayer,
  systemName: 'shopping',
});
