import { backendLibrary, type IBackendLibrary } from "@qrk.sh/bricks/definition/backendLibrary";
import { makeModuleViewLibrary } from "./make/makeModuleViewLibrary";
import { figmaThumbnailView } from "@qrk.sh/bricks/figmaThumbnail/view";
import { githubActivityView } from "@qrk.sh/bricks/githubActivity/view";
import { githubProfileView } from "@qrk.sh/bricks/githubProfile/view";
import { githubRepoView } from "@qrk.sh/bricks/githubRepo/view";
import { imageView } from "@qrk.sh/bricks/image/view";
import { instagramView } from "@qrk.sh/bricks/instagram/view";
import { linkView } from "./link/linkView";
import { mapPlaceView } from "@qrk.sh/bricks/mapPlace/view";
import { swatchAndIconView } from "@qrk.sh/bricks/swatchAndIcon/view";
import { articleView } from "@qrk.sh/bricks/article/view";

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
