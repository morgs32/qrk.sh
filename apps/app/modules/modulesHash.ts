import { backendLibrary, type IBackendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { makeModuleViewLibrary } from "./make/makeModuleViewLibrary";
import { figmaThumbnailView } from "@qrk.sh/bricks/modules/figmaThumbnail/view";
import { githubActivityView } from "@qrk.sh/bricks/modules/githubActivity/view";
import { githubProfileView } from "@qrk.sh/bricks/modules/githubProfile/view";
import { githubRepoView } from "@qrk.sh/bricks/modules/githubRepo/view";
import { imageView } from "@qrk.sh/bricks/modules/image/view";
import { instagramView } from "@qrk.sh/bricks/modules/instagram/view";
import { linkView } from "./link/linkView";
import { mapPlaceView } from "@qrk.sh/bricks/modules/mapPlace/view";
import { swatchAndIconView } from "@qrk.sh/bricks/modules/swatchAndIcon/view";
import { articleView } from "@qrk.sh/bricks/modules/article/view";

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
