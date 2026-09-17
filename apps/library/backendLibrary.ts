import { makeBackendLibrary } from "./make/makeBackendLibrary";
import { figmaThumbnailV1 } from "./modules/figmaThumbnail/figmaThumbnailV1";
import { githubActivityV1 } from "./modules/githubActivity/githubActivityV1";
import { githubProfileV1 } from "./modules/githubProfile/githubProfileV1";
import { githubRepoV1 } from "./modules/githubRepo/githubRepoV1";
import { imageV1 } from "./modules/image/imageV1";
import { instagramV1 } from "./modules/instagram/instagramV1";
import { linkV1 } from "./modules/link/linkV1";
import { mapPlaceV1 } from "./modules/mapPlace/mapPlaceV1";
import { swatchAndIconV1 } from "./modules/swatchAndIcon/swatchAndIconV1";
import { textV1 } from "./modules/text/textV1";

export const backendLibrary = makeBackendLibrary({
  "swatch-and-icon": swatchAndIconV1,
  "github-activity": githubActivityV1,
  "github-profile": githubProfileV1,
  "github-repo": githubRepoV1,
  "figma-thumbnail": figmaThumbnailV1,
  image: imageV1,
  instagram: instagramV1,
  link: linkV1,
  "map-place": mapPlaceV1,
  text: textV1,
});

export type IBackendLibrary = typeof backendLibrary;
