import { contracts, primitives } from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { catalogMarker } from '../../models/catalogMarker/catalogMarker';
import { catalogMarkerV1 } from '../../models/catalogMarker/CatalogMarkerV1';

import { createCatalogMarker } from './createCatalogMarker';

export const createCatalogMarkerV1 = contracts.makeVersion(
  createCatalogMarker,
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: catalogMarker.abbreviation }),
      label: primitives.text(),
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
