"use client";

import type { IBackendLibrary } from "./backendLibrary";
import type { IModule } from "./react/types";
import { articleView } from "./article/react/articleView";
import { behanceView } from "./behance/react/behanceView";
import { buyMeACoffeeView } from "./buyMeACoffee/react/buyMeACoffeeView";
import { figmaThumbnailView } from "./figmaThumbnail/react/figmaThumbnailView";
import { githubActivityView } from "./githubActivity/react/githubActivityView";
import { githubProfileView } from "./githubProfile/react/githubProfileView";
import { githubRepoView } from "./githubRepo/react/githubRepoView";
import { imageView } from "./image/react/imageView";
import { imageCarouselView } from "./imageCarousel/react/imageCarouselView";
import { instagramView } from "./instagram/react/instagramView";
import { linkView } from "./link/react/linkView";
import { mapPlaceView } from "./mapPlace/react/mapPlaceView";
import { spotifyView } from "./spotify/react/spotifyView";
import { swatchAndIconView } from "./swatchAndIcon/react/swatchAndIconView";
import { textView } from "./text/react/textView";
import { youtubeView } from "./youtube/react/youtubeView";

export const reactLibrary = {
  "swatch-and-icon": swatchAndIconView,
  "github-activity": githubActivityView,
  "github-profile": githubProfileView,
  "github-repo": githubRepoView,
  "figma-thumbnail": figmaThumbnailView,
  image: imageView,
  "image-carousel": imageCarouselView,
  spotify: spotifyView,
  youtube: youtubeView,
  text: textView,
  instagram: instagramView,
  link: linkView,
  "map-place": mapPlaceView,
  article: articleView,
  behance: behanceView,
  "buy-me-a-coffee": buyMeACoffeeView,
} satisfies { [K in keyof IBackendLibrary]: IModule<K> };
