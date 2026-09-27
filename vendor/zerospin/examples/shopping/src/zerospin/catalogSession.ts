import { makeSession } from '@zerospin/browser';

import { applicationLayer } from './applicationLayer';
import { catalogIdentitySchema, clerkCredentialsSchema } from './identities';
import { productV1 } from './services/app/models/product/ProductV1';

export const catalogSession = makeSession({
  identitySchema: catalogIdentitySchema,
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
