import { makeBackendLibrary } from "./make/makeBackendLibrary";
import { defaultSpec as figmaThumbnailDefaultSpec } from "./modules/figmaThumbnail/generative/defaultSpec";
import { figmaThumbnailJsonRenderCatalog } from "./modules/figmaThumbnail/generative/FigmaThumbnailJsonRenderCatalog";
import { defaultSpec as githubActivityDefaultSpec } from "./modules/githubActivity/generative/defaultSpec";
import { githubActivityJsonRenderCatalog } from "./modules/githubActivity/generative/GitHubActivityJsonRenderCatalog";
import { defaultSpec as githubProfileDefaultSpec } from "./modules/githubProfile/generative/defaultSpec";
import { githubProfileJsonRenderCatalog } from "./modules/githubProfile/generative/GitHubProfileJsonRenderCatalog";
import { defaultSpec as githubRepoDefaultSpec } from "./modules/githubRepo/generative/defaultSpec";
import { githubRepoJsonRenderCatalog } from "./modules/githubRepo/generative/GitHubRepoJsonRenderCatalog";
import { defaultSpec as imageDefaultSpec } from "./modules/image/generative/defaultSpec";
import { imageJsonRenderCatalog } from "./modules/image/generative/ImageJsonRenderCatalog";
import { defaultSpec as instagramDefaultSpec } from "./modules/instagram/generative/defaultSpec";
import { instagramJsonRenderCatalog } from "./modules/instagram/generative/InstagramJsonRenderCatalog";
import { defaultSpec as linkDefaultSpec } from "./modules/link/generative/defaultSpec";
import { linkJsonRenderCatalog } from "./modules/link/generative/LinkJsonRenderCatalog";
import { defaultSpec as mapPlaceDefaultSpec } from "./modules/mapPlace/generative/defaultSpec";
import { mapPlaceJsonRenderCatalog } from "./modules/mapPlace/generative/MapPlaceJsonRenderCatalog";
import { defaultSpec as swatchAndIconDefaultSpec } from "./modules/swatchAndIcon/generative/defaultSpec";
import { swatchAndIconJsonRenderCatalog } from "./modules/swatchAndIcon/generative/SwatchAndIconJsonRenderCatalog";
import { defaultSpec as textDefaultSpec } from "./modules/text/generative/defaultSpec";
import { textJsonRenderCatalog } from "./modules/text/generative/TextJsonRenderCatalog";

export const backendLibrary = makeBackendLibrary({
  "swatch-and-icon": {
    catalog: swatchAndIconJsonRenderCatalog,
    defaultSpec: swatchAndIconDefaultSpec,
  },
  "github-activity": {
    catalog: githubActivityJsonRenderCatalog,
    defaultSpec: githubActivityDefaultSpec,
  },
  "github-profile": {
    catalog: githubProfileJsonRenderCatalog,
    defaultSpec: githubProfileDefaultSpec,
  },
  "github-repo": {
    catalog: githubRepoJsonRenderCatalog,
    defaultSpec: githubRepoDefaultSpec,
  },
  "figma-thumbnail": {
    catalog: figmaThumbnailJsonRenderCatalog,
    defaultSpec: figmaThumbnailDefaultSpec,
  },
  image: {
    catalog: imageJsonRenderCatalog,
    defaultSpec: imageDefaultSpec,
  },
  instagram: {
    catalog: instagramJsonRenderCatalog,
    defaultSpec: instagramDefaultSpec,
  },
  link: {
    catalog: linkJsonRenderCatalog,
    defaultSpec: linkDefaultSpec,
  },
  "map-place": {
    catalog: mapPlaceJsonRenderCatalog,
    defaultSpec: mapPlaceDefaultSpec,
  },
  text: {
    catalog: textJsonRenderCatalog,
    defaultSpec: textDefaultSpec,
  },
});

export type IBackendLibrary = typeof backendLibrary;
