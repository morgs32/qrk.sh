import { blackCircleCollection } from "./collections/BlackCircle/BlackCircleCollection";
import { blackMCollection } from "./collections/BlackMLogo/BlackMLogoCollection";
import { blueGridCollection } from "./collections/BlueGrid/BlueGridCollection";
import { creamBenchCollection } from "./collections/CreamBench/CreamBenchCollection";
import { creamSquareCollection } from "./collections/CreamSquare/CreamSquareCollection";
import { greenArchCollection } from "./collections/GreenArch/GreenArchCollection";
import { greenCrossCollection } from "./collections/GreenCross/GreenCrossCollection";
import { greenEmptyCollection } from "./collections/GreenEmpty/GreenEmptyCollection";
import { greenGCollection } from "./collections/GreenGLogo/GreenGLogoCollection";
import { orangeBlocksCollection } from "./collections/OrangeBlocks/OrangeBlocksCollection";
import { orangeFlagCollection } from "./collections/OrangeFlag/OrangeFlagCollection";
import { pinkAsteriskCollection } from "./collections/PinkAsterisk/PinkAsteriskCollection";
import { pinkDotsCollection } from "./collections/PinkDots/PinkDotsCollection";
import { purpleLinesCollection } from "./collections/PurpleLines/PurpleLinesCollection";
import { textTileCollection } from "./collections/TextTile/TextTileCollection";
import type { ICollectionTile } from "./types";

/** Full `makeCollection` results (`tiles` map + `list` order). */
export const homepageCatalogCollections = [
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
  greenCrossCollection,
  textTileCollection,
] as const;

export const homepageTileCollections: readonly ICollectionTile[][] = homepageCatalogCollections.map(
  (c) => Object.values(c.tiles).sort((a, b) => a.def.order - b.def.order),
);
