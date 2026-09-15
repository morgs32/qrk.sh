import { figmaCatalog } from "./catalogs/Figma/FigmaCatalog";
import { githubCatalog } from "./catalogs/GitHubCards/GitHubProfileCatalog";
import { imageCatalog } from "./catalogs/Image/ImageCatalog";
import { instagramCatalog } from "./catalogs/Instagram/InstagramCatalog";
import { linkCatalog } from "./catalogs/Link/LinkCatalog";
import { mapCatalog } from "./catalogs/Map/MapCatalog";
import { swatchCatalog } from "./catalogs/GreenEmpty/GreenEmptyCatalog";
import { iconCatalog } from "./catalogs/PinkAsterisk/PinkAsteriskCatalog";
import { textBrickCatalog } from "./catalogs/TextBrick/TextBrickCatalog";
import { tikTokCatalog } from "./catalogs/TikTok/TikTokCatalog";
import type { ICatalog } from "./types";

export const catalogsHash: Record<string, ICatalog> = {
  icon: iconCatalog,
  swatch: swatchCatalog,
  github: githubCatalog,
  figma: figmaCatalog,
  image: imageCatalog,
  instagram: instagramCatalog,
  link: linkCatalog,
  map: mapCatalog,
  text: textBrickCatalog,
  tiktok: tikTokCatalog,
};
