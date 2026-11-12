import type { Spec } from "@json-render/core";
import type { Schema } from "effect";
import { backendLibrary } from "./backendLibrary";
import { completeImageStateSchemaV4, imageV4 } from "./image/definition/imageV4";
import { imageV3, imageLayouts, completeImageStateSchema } from "./image/definition/imageV3";
import { completeStateSchema as swatchAndIconStateSchema } from "./swatchAndIcon/definition/swatchAndIconV1";
import { completeStateSchema as githubActivityStateSchema } from "./githubActivity/definition/githubActivityV1";
import { completeStateSchema as githubProfileStateSchema } from "./githubProfile/definition/githubProfileV1";
import { completeStateSchema as githubRepoStateSchema } from "./githubRepo/definition/githubRepoV1";
import { completeStateSchema as figmaThumbnailStateSchema } from "./figmaThumbnail/definition/figmaThumbnailV1";
import { completeStateSchema as imageCarouselStateSchema } from "./imageCarousel/definition/imageCarouselV1";
import { completeStateSchema as spotifyStateSchema } from "./spotify/definition/spotifyV1";
import { completeStateSchema as youtubeStateSchema } from "./youtube/definition/youtubeV1";
import { completeStateSchema as instagramStateSchema } from "./instagram/definition/instagramV1";
import { completeStateSchema as linkStateSchema } from "./link/definition/linkV1";
import { completeStateSchema as mapPlaceStateSchema } from "./mapPlace/definition/mapPlaceV1";
import { completeStateSchema as articleStateSchema } from "./article/definition/articleV1";
import { completeStateSchema as behanceStateSchema } from "./behance/definition/behanceV1";
import { completeStateSchema as buyMeACoffeeStateSchema } from "./buyMeACoffee/definition/buyMeACoffeeV1";

export const candidateLibrary: Record<
  keyof typeof backendLibrary,
  {
    module: (typeof backendLibrary)[keyof typeof backendLibrary] | typeof imageV3 | typeof imageV4;
    layouts: Record<string, Spec>;
    completeStateSchema: Schema.Codec<unknown>;
  }
> = {
  image: { module: imageV3, layouts: imageLayouts, completeStateSchema: completeImageStateSchema },
  "swatch-and-icon": {
    module: backendLibrary["swatch-and-icon"],
    layouts: { default: backendLibrary["swatch-and-icon"].defaultSpec },
    completeStateSchema: swatchAndIconStateSchema,
  },
  "github-activity": {
    module: backendLibrary["github-activity"],
    layouts: { default: backendLibrary["github-activity"].defaultSpec },
    completeStateSchema: githubActivityStateSchema,
  },
  "github-profile": {
    module: backendLibrary["github-profile"],
    layouts: { default: backendLibrary["github-profile"].defaultSpec },
    completeStateSchema: githubProfileStateSchema,
  },
  "github-repo": {
    module: backendLibrary["github-repo"],
    layouts: { default: backendLibrary["github-repo"].defaultSpec },
    completeStateSchema: githubRepoStateSchema,
  },
  "figma-thumbnail": {
    module: backendLibrary["figma-thumbnail"],
    layouts: { default: backendLibrary["figma-thumbnail"].defaultSpec },
    completeStateSchema: figmaThumbnailStateSchema,
  },
  "image-carousel": {
    module: backendLibrary["image-carousel"],
    layouts: { default: backendLibrary["image-carousel"].defaultSpec },
    completeStateSchema: imageCarouselStateSchema,
  },
  "spotify": {
    module: backendLibrary["spotify"],
    layouts: { default: backendLibrary["spotify"].defaultSpec },
    completeStateSchema: spotifyStateSchema,
  },
  youtube: {
    module: backendLibrary.youtube,
    layouts: { default: backendLibrary.youtube.defaultSpec },
    completeStateSchema: youtubeStateSchema,
  },
  "instagram": {
    module: backendLibrary["instagram"],
    layouts: { default: backendLibrary["instagram"].defaultSpec },
    completeStateSchema: instagramStateSchema,
  },
  "link": {
    module: backendLibrary["link"],
    layouts: { default: backendLibrary["link"].defaultSpec },
    completeStateSchema: linkStateSchema,
  },
  "map-place": {
    module: backendLibrary["map-place"],
    layouts: { default: backendLibrary["map-place"].defaultSpec },
    completeStateSchema: mapPlaceStateSchema,
  },
  "article": {
    module: backendLibrary["article"],
    layouts: { default: backendLibrary["article"].defaultSpec },
    completeStateSchema: articleStateSchema,
  },
  "behance": {
    module: backendLibrary["behance"],
    layouts: { default: backendLibrary["behance"].defaultSpec },
    completeStateSchema: behanceStateSchema,
  },
  "buy-me-a-coffee": {
    module: backendLibrary["buy-me-a-coffee"],
    layouts: { default: backendLibrary["buy-me-a-coffee"].defaultSpec },
    completeStateSchema: buyMeACoffeeStateSchema,
  },
};

export const candidateLibraryV20: typeof candidateLibrary = {
  ...candidateLibrary,
  image: { module: imageV4, layouts: imageLayouts, completeStateSchema: completeImageStateSchemaV4 },
};
