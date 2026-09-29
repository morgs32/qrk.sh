import type { IModel } from '@zerospin/core/models/types';
import * as sdk from '@zerospin/sdk/browser';

export {
  makeFulfillmentModelV1,
  makeFulfillmentModelWithWarehouse,
} from './portable.js';

/** Browser-safe read declarations for a pinned source composition. */
export const makeUserFrontendModuleV1 = <const MODEL extends IModel>(options: {
  source: {
    readonly name: 'fulfillment';
    readonly version: string;
    readonly models: { readonly fulfillment: MODEL };
  };
}) => {
  const fulfillment = sdk.makeReplica({
    sourceModel: options.source.models.fulfillment,
    serviceName: options.source.name,
    serviceVersion: options.source.version,
  });
  return {
    models: { fulfillment },
    contracts: {},
  };
};

export { makeFulfillmentFrontendModule } from './makeFulfillmentFrontendModule.js';
