import type { HomepageTileDefinition, HomepageTileVariantSize } from './types';

import { homepageTileCollections } from './homepageTileCollections';

const homepageTileVariantSizes: readonly HomepageTileVariantSize[] = ['1x1', '2x2', '4x1'];

export const homepageTiles: HomepageTileDefinition[] = homepageTileCollections.flatMap(
  (collection) =>
    homepageTileVariantSizes
      .filter((size) => collection.components[size] != null)
      .map((size) => ({
        typeId:
          size === '2x2' ? collection.collectionId : `${collection.collectionId}--${size}`,
        collectionId: collection.collectionId,
        collectionLabel: collection.collectionLabel,
        label: collection.collectionLabel,
        size,
        Component: collection.components[size]!
      }))
);
