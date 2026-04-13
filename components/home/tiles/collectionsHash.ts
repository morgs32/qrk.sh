import { blackCircleCollection } from "./collections/BlackCircle/BlackCircleCollection";
import { blackMCollection } from "./collections/BlackMLogo/BlackMLogoCollection";
import { blueGridCollection } from "./collections/BlueGrid/BlueGridCollection";
import { creamBenchCollection } from "./collections/CreamBench/CreamBenchCollection";
import { creamSquareCollection } from "./collections/CreamSquare/CreamSquareCollection";
import { figmaCollection } from "./collections/Figma/FigmaCollection";
import { greenArchCollection } from "./collections/GreenArch/GreenArchCollection";
import { githubCardsCollection } from "./collections/GitHubCards/GitHubCardsCollection";
import { imageCollection } from "./collections/Image/ImageCollection";
import { greenCrossCollection } from "./collections/GreenCross/GreenCrossCollection";
import { greenEmptyCollection } from "./collections/GreenEmpty/GreenEmptyCollection";
import { greenGCollection } from "./collections/GreenGLogo/GreenGLogoCollection";
import { orangeBlocksCollection } from "./collections/OrangeBlocks/OrangeBlocksCollection";
import { orangeFlagCollection } from "./collections/OrangeFlag/OrangeFlagCollection";
import { pinkAsteriskCollection } from "./collections/PinkAsterisk/PinkAsteriskCollection";
import { pinkDotsCollection } from "./collections/PinkDots/PinkDotsCollection";
import { purpleLinesCollection } from "./collections/PurpleLines/PurpleLinesCollection";
import { textTileCollection } from "./collections/TextTile/TextTileCollection";
import { ICollection } from "./types";

export const collectionsHash = {
  "orange-flag": orangeFlagCollection,
  "black-circle": blackCircleCollection,
  "green-arch": greenArchCollection,
  "blue-grid": blueGridCollection,
  "cream-bench": creamBenchCollection,
  "green-g": greenGCollection,
  "cream-square": creamSquareCollection,
  "pink-dots": pinkDotsCollection,
  "black-m": blackMCollection,
  "orange-blocks": orangeBlocksCollection,
  "purple-lines": purpleLinesCollection,
  "pink-asterisk": pinkAsteriskCollection,
  "green-empty": greenEmptyCollection,
  "green-cross": greenCrossCollection,
  "github-cards": githubCardsCollection,
  figma: figmaCollection,
  image: imageCollection,
  "text-tile": textTileCollection,
} as const satisfies Record<string, ICollection>;
