// Frozen module codecs used by retained command history. No current form uses this registry.
import { makeBackendLibrary } from "./make/makeBackendLibrary";
import { figmaThumbnailV1 } from "./figmaThumbnail/figmaThumbnailV1";
import { githubActivityV1 } from "./githubActivity/githubActivityV1";
import { githubProfileV1 } from "./githubProfile/githubProfileV1";
import { githubRepoV1 } from "./githubRepo/githubRepoV1";
import { imageV1 } from "./image/imageV1";
import { instagramV1 } from "./instagram/instagramV1";
import { linkV1 } from "./link/linkV1";
import { mapPlaceV1 } from "./mapPlace/mapPlaceV1";
import { swatchAndIconV1 } from "./swatchAndIcon/swatchAndIconV1";
import { articleV1 } from "./article/articleV1";

export const backendLibraryV1 = makeBackendLibrary({
  "swatch-and-icon": swatchAndIconV1,
  "github-activity": githubActivityV1,
  "github-profile": githubProfileV1,
  "github-repo": githubRepoV1,
  "figma-thumbnail": figmaThumbnailV1,
  image: imageV1,
  instagram: instagramV1,
  link: linkV1,
  "map-place": mapPlaceV1,
  article: articleV1,
});

