import * as sdk from '@zerospin/sdk/browser';

import { catalogMarker } from './catalogMarker';

export const catalogMarkerV1 = sdk.makeModelVersion(catalogMarker, {
  attributes: {
    label: sdk.primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});
