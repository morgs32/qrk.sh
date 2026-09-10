import { makeReplica } from '@zerospin/sdk/browser';

import { productV1 } from '../../../../services/app/models/product/ProductV1';

export const productReplicaV1 = makeReplica({
  sourceModel: productV1,
  modelVersion: productV1.version,
  serviceName: 'app',
});
