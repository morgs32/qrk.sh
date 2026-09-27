import * as sdk from '@zerospin/sdk/browser';

import { productV1 } from '../../../../services/app/models/product/ProductV1';
export const productReplicaV1 = sdk.makeReplica({
  sourceModel: productV1,
  serviceVersion: '1.0.0',
  serviceName: 'app',
});
