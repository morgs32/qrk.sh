import type {
  AlignmentByBreakpoint,
  HiddenByBreakpoint,
  TileSize
} from '@/lib/stores/portfolio-grid-store';
import type { HomepageTileCollection, HomepageTileDefinition } from './types';

import { blackCircleCollection } from './collections/BlackCircle';
import { blackMCollection } from './collections/BlackMLogo';
import { blueGridCollection } from './collections/BlueGrid';
import { creamBenchCollection } from './collections/CreamBench';
import { creamSquareCollection } from './collections/CreamSquare';
import { greenArchCollection } from './collections/GreenArch';
import { greenCrossCollection } from './collections/GreenCross';
import { greenEmptyCollection } from './collections/GreenEmpty';
import { greenGCollection } from './collections/GreenGLogo';
import { orangeBlocksCollection } from './collections/OrangeBlocks';
import { orangeFlagCollection } from './collections/OrangeFlag';
import { pinkAsteriskCollection } from './collections/PinkAsterisk';
import { pinkDotsCollection } from './collections/PinkDots';
import { purpleLinesCollection } from './collections/PurpleLines';

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

