import { backendLibrary, type IBackendLibrary } from "@qrk.sh/zerospin/src/modules/backendLibrary";
import { makeModuleViewLibrary } from "../make/makeModuleViewLibrary";
import { figmaThumbnailView } from "../figmaThumbnail/figmaThumbnailView";
import { githubActivityView } from "../githubActivity/githubActivityView";
import { githubProfileView } from "../githubProfile/githubProfileView";
import { githubRepoView } from "../githubRepo/githubRepoView";
import { imageView } from "../image/imageView";
import { instagramView } from "../instagram/instagramView";
import { linkView } from "../link/linkView";
import { mapPlaceView } from "../mapPlace/mapPlaceView";
import { swatchAndIconView } from "../swatchAndIcon/swatchAndIconView";
import { articleView } from "../article/articleView";

export const modulesHash = makeModuleViewLibrary<IBackendLibrary>(backendLibrary, {
  "swatch-and-icon": swatchAndIconView,
  "github-activity": githubActivityView,
  "github-profile": githubProfileView,
  "github-repo": githubRepoView,
  "figma-thumbnail": figmaThumbnailView,
  image: imageView,
  instagram: instagramView,
  link: linkView,
  "map-place": mapPlaceView,
  article: articleView,
});
