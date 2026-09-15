import { figmaThumbnail } from "./modules/figmaThumbnail/figmaThumbnail";
import { githubProfile } from "./modules/githubProfile/githubProfile";
import { githubRepo } from "./modules/githubRepo/githubRepo";
import { icon } from "./modules/icon/icon";
import { image } from "./modules/image/image";
import { instagram } from "./modules/instagram/instagram";
import { link } from "./modules/link/link";
import { mapPlace } from "./modules/mapPlace/mapPlace";
import { swatch } from "./modules/swatch/swatch";
import { text } from "./modules/text/text";
import { tiktok } from "./modules/tiktok/tiktok";
import type { IModule } from "./types";

export const modulesHash: Record<string, IModule> = {
  icon,
  swatch,
  "github-profile": githubProfile,
  "github-repo": githubRepo,
  "figma-thumbnail": figmaThumbnail,
  image,
  instagram,
  link,
  "map-place": mapPlace,
  text,
  tiktok,
};
