import { makeBackendLibrary } from "../definition/makeBackendLibrary";
import { figmaThumbnailV1 } from "./figmaThumbnail/definition/figmaThumbnailV1";
import { githubActivityV1 } from "./githubActivity/definition/githubActivityV1";
import { githubProfileV1 } from "./githubProfile/definition/githubProfileV1";
import { githubRepoV1 } from "./githubRepo/definition/githubRepoV1";
import { imageV1 } from "./image/definition/imageV1";
import { imageCarouselV1 } from "./imageCarousel/definition/imageCarouselV1";
import { instagramV1 } from "./instagram/definition/instagramV1";
import { linkV1 } from "./link/definition/linkV1";
import { mapPlaceV1 } from "./mapPlace/definition/mapPlaceV1";
import { swatchAndIconV1 } from "./swatchAndIcon/definition/swatchAndIconV1";
import { articleV1 } from "./article/definition/articleV1";

import { behanceV1 } from "./behance/definition/behanceV1";
import { buyMeACoffeeV1 } from "./buyMeACoffee/definition/buyMeACoffeeV1";

export const backendLibrary = makeBackendLibrary({
  "swatch-and-icon": swatchAndIconV1,
  "github-activity": githubActivityV1,
  "github-profile": githubProfileV1,
  "github-repo": githubRepoV1,
  "figma-thumbnail": figmaThumbnailV1,
  image: imageV1,
  "image-carousel": imageCarouselV1,
  instagram: instagramV1,
  link: linkV1,
  "map-place": mapPlaceV1,
  article: articleV1,
  behance: behanceV1,
  "buy-me-a-coffee": buyMeACoffeeV1,
});

export type IBackendLibrary = typeof backendLibrary;
