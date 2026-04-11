import type {
  AlignmentByBreakpoint,
  HiddenByBreakpoint,
  TileSize
} from '@/lib/stores/portfolio-grid-store';
import type { HomepageTileDefinition, HomepageTileVariantSize, ITileCollection } from './types';

import { blackCircleCollection } from './collections/BlackCircle/BlackCircleCollection';
import { blackMCollection } from './collections/BlackMLogo/BlackMLogoCollection';
import { blueGridCollection } from './collections/BlueGrid/BlueGridCollection';
import { creamBenchCollection } from './collections/CreamBench/CreamBenchCollection';
import { creamSquareCollection } from './collections/CreamSquare/CreamSquareCollection';
import { greenArchCollection } from './collections/GreenArch/GreenArchCollection';
import { greenCrossCollection } from './collections/GreenCross/GreenCrossCollection';
import { greenEmptyCollection } from './collections/GreenEmpty/GreenEmptyCollection';
import { greenGCollection } from './collections/GreenGLogo/GreenGLogoCollection';
import { orangeBlocksCollection } from './collections/OrangeBlocks/OrangeBlocksCollection';
import { orangeFlagCollection } from './collections/OrangeFlag/OrangeFlagCollection';
import { pinkAsteriskCollection } from './collections/PinkAsterisk/PinkAsteriskCollection';
import { pinkDotsCollection } from './collections/PinkDots/PinkDotsCollection';
import { purpleLinesCollection } from './collections/PurpleLines/PurpleLinesCollection';

const homepageTileCollections: readonly ITileCollection[] = [
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

const homepageTileVariantSizes: readonly HomepageTileVariantSize[] = ['1x1', '2x2', '4x1'];

export const homepageTiles: HomepageTileDefinition[] = homepageTileCollections.flatMap(
  (collection) =>
    homepageTileVariantSizes.map((size) => ({
      typeId:
        size === '2x2' ? collection.collectionId : `${collection.collectionId}--${size}`,
      collectionId: collection.collectionId,
      collectionLabel: collection.collectionLabel,
      label: collection.collectionLabel,
      size,
      Component: collection.components[size]
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
