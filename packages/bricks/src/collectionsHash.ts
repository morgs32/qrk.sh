import { figmaCollection } from "./collections/Figma/FigmaCollection";
import { githubCollection } from "./collections/GitHubCards/GitHubProfileCollection";
import { imageCollection } from "./collections/Image/ImageCollection";
import { instagramCollection } from "./collections/Instagram/InstagramCollection";
import { linkCollection } from "./collections/Link/LinkCollection";
import { mapCollection } from "./collections/Map/MapCollection";
import { swatchCollection } from "./collections/GreenEmpty/GreenEmptyCollection";
import { iconCollection } from "./collections/PinkAsterisk/PinkAsteriskCollection";
import { textBrickCollection } from "./collections/TextBrick/TextBrickCollection";
import { tikTokCollection } from "./collections/TikTok/TikTokCollection";
import type { ICollection } from "./types";

export const collectionsHash: Record<string, ICollection> = {
  icon: iconCollection,
  swatch: swatchCollection,
  github: githubCollection,
  figma: figmaCollection,
  image: imageCollection,
  instagram: instagramCollection,
  link: linkCollection,
  map: mapCollection,
  text: textBrickCollection,
  tiktok: tikTokCollection,
};
