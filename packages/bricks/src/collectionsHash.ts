import { figmaCollection } from "./collections/Figma/FigmaCollection";
import { githubCollection } from "./collections/GitHubCards/GitHubProfileCollection";
import { imageCollection } from "./collections/Image/ImageCollection";
import { swatchCollection } from "./collections/GreenEmpty/GreenEmptyCollection";
import { iconCollection } from "./collections/PinkAsterisk/PinkAsteriskCollection";
import { textBrickCollection } from "./collections/TextBrick/TextBrickCollection";
import type { ICollection } from "./types";

export const collectionsHash: Record<string, ICollection> = {
  icon: iconCollection,
  swatch: swatchCollection,
  github: githubCollection,
  figma: figmaCollection,
  image: imageCollection,
  "text-brick": textBrickCollection,
};
