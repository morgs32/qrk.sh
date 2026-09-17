import { backendLibrary, type IBackendLibrary } from "../backendLibrary";
import { makeFrontendLibrary } from "../make/makeFrontendLibrary";
import { figmaThumbnailFrontend } from "../modules/figmaThumbnail/figmaThumbnailFrontend";
import { githubActivityFrontend } from "../modules/githubActivity/githubActivityFrontend";
import { githubProfileFrontend } from "../modules/githubProfile/githubProfileFrontend";
import { githubRepoFrontend } from "../modules/githubRepo/githubRepoFrontend";
import { imageFrontend } from "../modules/image/imageFrontend";
import { instagramFrontend } from "../modules/instagram/instagramFrontend";
import { linkFrontend } from "../modules/link/linkFrontend";
import { mapPlaceFrontend } from "../modules/mapPlace/mapPlaceFrontend";
import { swatchAndIconFrontend } from "../modules/swatchAndIcon/swatchAndIconFrontend";
import { textFrontend } from "../modules/text/textFrontend";

export const modulesHash = makeFrontendLibrary<IBackendLibrary>(backendLibrary, {
  "swatch-and-icon": swatchAndIconFrontend,
  "github-activity": githubActivityFrontend,
  "github-profile": githubProfileFrontend,
  "github-repo": githubRepoFrontend,
  "figma-thumbnail": figmaThumbnailFrontend,
  image: imageFrontend,
  instagram: instagramFrontend,
  link: linkFrontend,
  "map-place": mapPlaceFrontend,
  text: textFrontend,
});
