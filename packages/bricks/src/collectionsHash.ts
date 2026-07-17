import { blackCircleCollection } from "./collections/BlackCircle/BlackCircleCollection";
import { blackMCollection } from "./collections/BlackMLogo/BlackMLogoCollection";
import { blueGridCollection } from "./collections/BlueGrid/BlueGridCollection";
import { creamBenchCollection } from "./collections/CreamBench/CreamBenchCollection";
import { creamSquareCollection } from "./collections/CreamSquare/CreamSquareCollection";
import { figmaCollection } from "./collections/Figma/FigmaCollection";
import { greenArchCollection } from "./collections/GreenArch/GreenArchCollection";
import { githubProfileCollection } from "./collections/GitHubCards/GitHubProfileCollection";
import { githubRepoCollection } from "./collections/GitHubCards/GitHubRepoCollection";
import { imageCollection } from "./collections/Image/ImageCollection";
import { greenCrossCollection } from "./collections/GreenCross/GreenCrossCollection";
import { greenEmptyCollection } from "./collections/GreenEmpty/GreenEmptyCollection";
import { greenGCollection } from "./collections/GreenGLogo/GreenGLogoCollection";
import { orangeBlocksCollection } from "./collections/OrangeBlocks/OrangeBlocksCollection";
import { orangeFlagCollection } from "./collections/OrangeFlag/OrangeFlagCollection";
import { pinkAsteriskCollection } from "./collections/PinkAsterisk/PinkAsteriskCollection";
import { pinkDotsCollection } from "./collections/PinkDots/PinkDotsCollection";
import { purpleLinesCollection } from "./collections/PurpleLines/PurpleLinesCollection";
import { textBrickCollection } from "./collections/TextBrick/TextBrickCollection";
import type { ICollection } from "./types";

export const collectionsHash = {
  "orange-flag": orangeFlagCollection,
  "black-circle": blackCircleCollection,
  "green-arch": greenArchCollection,
  "blue-grid": blueGridCollection,
  "cream-bench": creamBenchCollection,
  "green-g-logo": greenGCollection,
  "cream-square": creamSquareCollection,
  "pink-dots": pinkDotsCollection,
  "black-m-logo": blackMCollection,
  "orange-block": orangeBlocksCollection,
  "purple-lines": purpleLinesCollection,
  "pink-asterisk": pinkAsteriskCollection,
  "green-empty": greenEmptyCollection,
  "green-cross": greenCrossCollection,
  "github-profile": githubProfileCollection,
  "github-repo": githubRepoCollection,
  figma: figmaCollection,
  image: imageCollection,
  "text-brick": textBrickCollection,
} as const satisfies Record<string, ICollection>;
