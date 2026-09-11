import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { catalogMarker } from '../../models/catalogMarker/catalogMarker';
import { catalogMarkerV1 } from '../../models/catalogMarker/CatalogMarkerV1';

import { createCatalogMarker } from './createCatalogMarker';

export const createCatalogMarkerV1 = sdk.makeContractVersion(
  createCatalogMarker,
  {
    payload: {
      id: sdk.primitives.foreignKey({
        abbreviation: catalogMarker.abbreviation,
      }),
      label: sdk.primitives.text(),
    },

    models: { catalogMarker: catalogMarkerV1 },
    program: ({ payload, models }) => {
      const { id, label } = payload;
      return Effect.all({
        created: models.catalogMarker.create({
          resourceId: id,
          attributes: { label },
        }),
      });
    },
    version: '1.0.0',
  },
);
