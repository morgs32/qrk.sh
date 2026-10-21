import { makeBackendLibrary } from "./make/makeBackendLibrary";
import { figmaThumbnailV2 } from "./figmaThumbnail/figmaThumbnailV2";
import { githubActivityV2 } from "./githubActivity/githubActivityV2";
import { githubProfileV2 } from "./githubProfile/githubProfileV2";
import { githubRepoV2 } from "./githubRepo/githubRepoV2";
import { imageV1 } from "./image/imageV1";
import { instagramV2 } from "./instagram/instagramV2";
import { linkV2 } from "./link/linkV2";
import { mapPlaceV2 } from "./mapPlace/mapPlaceV2";
import { swatchAndIconV1 } from "./swatchAndIcon/swatchAndIconV1";
import { articleV1 } from "./article/articleV1";

export const backendLibrary = makeBackendLibrary({
  "swatch-and-icon": swatchAndIconV1,
  "github-activity": githubActivityV2,
  "github-profile": githubProfileV2,
  "github-repo": githubRepoV2,
  "figma-thumbnail": figmaThumbnailV2,
  image: imageV1,
  instagram: instagramV2,
  link: linkV2,
  "map-place": mapPlaceV2,
  article: articleV1,
});

export type IBackendLibrary = typeof backendLibrary;
