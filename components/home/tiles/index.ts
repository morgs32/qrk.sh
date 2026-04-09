import type {
  AlignmentByBreakpoint,
  HiddenByBreakpoint,
  TileSize
} from '@/lib/stores/portfolio-grid-store';
import type { HomepageTileCollection, HomepageTileDefinition } from './types';

import { blackCircleCollection } from './collections/black-circle';
import { blackMCollection } from './collections/black-m-logo';
import { blueGridCollection } from './collections/blue-grid';
import { creamBenchCollection } from './collections/cream-bench';
import { creamSquareCollection } from './collections/cream-square';
import { greenArchCollection } from './collections/green-arch';
import { greenCrossCollection } from './collections/green-cross';
import { greenEmptyCollection } from './collections/green-empty';
import { greenGCollection } from './collections/green-g-logo';
import { orangeBlocksCollection } from './collections/orange-block';
import { orangeFlagCollection } from './collections/orange-flag';
import { pinkAsteriskCollection } from './collections/pink-asterisk';
import { pinkDotsCollection } from './collections/pink-dots';
import { purpleLinesCollection } from './collections/purple-lines';

const homepageTileCollections: readonly HomepageTileCollection[] = [
  orangeFlagCollection,
  blackCircleCollection,
  greenArchCollection,
  blueGridCollection,
  creamBenchCollection,
  greenGCollection,
  creamSquareCollection,
  pinkDotsCollection,
  blackMCollection,
  orangeBlocksCollection,
  purpleLinesCollection,
  pinkAsteriskCollection,
  greenEmptyCollection,
  greenCrossCollection
];

const homepageTileVariantSizes: readonly TileSize[] = ['1x1', '2x2', '4x1'];

export const homepageTiles: HomepageTileDefinition[] = homepageTileCollections.flatMap(
  (collection) =>
    homepageTileVariantSizes.map((size) => ({
      typeId:
        size === '2x2' ? collection.collectionId : `${collection.collectionId}--${size}`,
      collectionId: collection.collectionId,
      collectionLabel: collection.collectionLabel,
      label: collection.collectionLabel,
      size,
      Component: collection.Component
    }))
);

export const homepageGridConfig: {
  alignmentByBreakpoint: AlignmentByBreakpoint;
  hiddenByBreakpoint: HiddenByBreakpoint;
} = {
  alignmentByBreakpoint: {
    lg: 'left',
    md: 'left',
    sm: 'left'
  },
  hiddenByBreakpoint: {
    lg: [],
    md: [],
    sm: []
  }
};

