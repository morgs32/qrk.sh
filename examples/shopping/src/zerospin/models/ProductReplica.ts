import { makeReplica } from '@zerospin/sdk/browser';

import { Product } from './Product';

export const ProductReplica = makeReplica({
  sourceModel: Product,
  serviceName: 'app',
});
