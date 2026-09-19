import { backendLibrary, type IBackendLibrary } from "../backendLibrary";
import { makeModuleViewLibrary } from "../make/makeModuleViewLibrary";
import { figmaThumbnailView } from "../modules/figmaThumbnail/figmaThumbnailView";
import { githubActivityView } from "../modules/githubActivity/githubActivityView";
import { githubProfileView } from "../modules/githubProfile/githubProfileView";
import { githubRepoView } from "../modules/githubRepo/githubRepoView";
import { imageView } from "../modules/image/imageView";
import { instagramView } from "../modules/instagram/instagramView";
import { linkView } from "../modules/link/linkView";
import { mapPlaceView } from "../modules/mapPlace/mapPlaceView";
import { swatchAndIconView } from "../modules/swatchAndIcon/swatchAndIconView";
import { textView } from "../modules/text/textView";

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
  text: textView,
});
