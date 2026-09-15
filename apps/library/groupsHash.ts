import { figmaGroup } from "./groups/figma/figmaGroup";
import { githubGroup } from "./groups/github/githubGroup";
import { imageGroup } from "./groups/image/imageGroup";
import { instagramGroup } from "./groups/instagram/instagramGroup";
import { linkGroup } from "./groups/link/linkGroup";
import { mapGroup } from "./groups/map/mapGroup";
import { swatchGroup } from "./groups/swatch/swatchGroup";
import { iconGroup } from "./groups/icon/iconGroup";
import { textBrickGroup } from "./groups/text/textBrickGroup";
import { tikTokGroup } from "./groups/tiktok/tikTokGroup";
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
