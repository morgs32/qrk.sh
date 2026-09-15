import { figmaGroup } from "./groups/Figma/FigmaGroup";
import { githubGroup } from "./groups/GitHubCards/GitHubProfileGroup";
import { imageGroup } from "./groups/Image/ImageGroup";
import { instagramGroup } from "./groups/Instagram/InstagramGroup";
import { linkGroup } from "./groups/Link/LinkGroup";
import { mapGroup } from "./groups/Map/MapGroup";
import { swatchGroup } from "./groups/GreenEmpty/GreenEmptyGroup";
import { iconGroup } from "./groups/PinkAsterisk/PinkAsteriskGroup";
import { textBrickGroup } from "./groups/TextBrick/TextBrickGroup";
import { tikTokGroup } from "./groups/TikTok/TikTokGroup";
import type { IGroup } from "./types";

export const groupsHash: Record<string, IGroup> = {
  icon: iconGroup,
  swatch: swatchGroup,
  github: githubGroup,
  figma: figmaGroup,
  image: imageGroup,
  instagram: instagramGroup,
  link: linkGroup,
  map: mapGroup,
  text: textBrickGroup,
  tiktok: tikTokGroup,
};
