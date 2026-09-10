import { models, primitives } from '@zerospin/sdk/browser';

import { catalogMarker } from './catalogMarker';

export const catalogMarkerV1 = models.makeVersion(catalogMarker, {
  attributes: {
    label: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});
