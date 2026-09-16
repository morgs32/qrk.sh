import { backendLibrary, type IBackendLibrary } from "../backendLibrary";
import { makeFrontendLibrary } from "../make/makeFrontendLibrary";
import { figmaThumbnail } from "../modules/figmaThumbnail/figmaThumbnail";
import { githubActivity } from "../modules/githubActivity/githubActivity";
import { githubProfile } from "../modules/githubProfile/githubProfile";
import { githubRepo } from "../modules/githubRepo/githubRepo";
import { image } from "../modules/image/image";
import { instagram } from "../modules/instagram/instagram";
import { link } from "../modules/link/link";
import { mapPlace } from "../modules/mapPlace/mapPlace";
import { swatchAndIcon } from "../modules/swatchAndIcon/swatchAndIcon";
import { text } from "../modules/text/text";

export const modulesHash = makeFrontendLibrary<IBackendLibrary>(backendLibrary, {
  "swatch-and-icon": swatchAndIcon,
  "github-activity": githubActivity,
  "github-profile": githubProfile,
  "github-repo": githubRepo,
  "figma-thumbnail": figmaThumbnail,
  image,
  instagram,
  link,
  "map-place": mapPlace,
  text,
});
