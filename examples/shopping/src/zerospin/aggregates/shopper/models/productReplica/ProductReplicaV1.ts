import * as sdk from '@zerospin/sdk/browser';

import { productV1 } from '../../../../services/app/models/product/ProductV1';

export const productReplicaV1 = sdk.makeReplica({
  sourceModel: productV1,
  modelVersion: productV1.version,
  serviceName: 'app',
});
