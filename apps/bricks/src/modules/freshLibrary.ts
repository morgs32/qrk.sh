import type { Spec } from "@json-render/core";
import type { IInferResource } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { brickV1 } from "../zerospin/models/brick/BrickV1";
import { backendLibrary } from "./backendLibrary";
import { freshDefaultSpec as articleSpec } from "./article/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as behanceSpec } from "./behance/definition/freshDefaultSpec";
import { freshDefaultSpec as buyMeACoffeeSpec } from "./buyMeACoffee/definition/freshDefaultSpec";
import { freshDefaultSpec as figmaThumbnailSpec } from "./figmaThumbnail/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as githubActivitySpec } from "./githubActivity/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as githubProfileSpec } from "./githubProfile/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as githubRepoSpec } from "./githubRepo/definition/generator/freshDefaultSpec";
import { freshImageLayouts, resolveImageLayout } from "./image/definition/freshImageLayouts";
import { freshDefaultSpec as instagramSpec } from "./instagram/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as linkSpec } from "./link/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as mapPlaceSpec } from "./mapPlace/definition/generator/freshDefaultSpec";
import { freshDefaultSpec as swatchAndIconSpec } from "./swatchAndIcon/definition/generator/freshDefaultSpec";

export const freshLibrary: Record<IInferResource<typeof brickV1>["moduleId"], {
  layouts: Record<string, Spec>;
  resolve?: (props: { layoutId: string; brickState: unknown; spec: Spec }) => Spec;
}> = {
  article: { layouts: { default: articleSpec } },
  behance: { layouts: { default: behanceSpec } },
  "buy-me-a-coffee": { layouts: { default: buyMeACoffeeSpec } },
  "figma-thumbnail": { layouts: { default: figmaThumbnailSpec } },
  "github-activity": { layouts: { default: githubActivitySpec } },
  "github-profile": { layouts: { default: githubProfileSpec } },
  "github-repo": { layouts: { default: githubRepoSpec } },
  image: { layouts: freshImageLayouts, resolve: resolveImageLayout },
  "image-carousel": { layouts: { default: backendLibrary["image-carousel"].defaultSpec } },
  instagram: { layouts: { default: instagramSpec } },
  link: { layouts: { default: linkSpec } },
  "map-place": { layouts: { default: mapPlaceSpec } },
  spotify: { layouts: { default: backendLibrary.spotify.defaultSpec } },
  "swatch-and-icon": { layouts: { default: swatchAndIconSpec } },
  text: { layouts: { default: backendLibrary.text.defaultSpec } },
  youtube: { layouts: { default: backendLibrary.youtube.defaultSpec } },
};

export function resolveBrickLayout(props: {
  moduleId: string;
  layoutId: string;
  brickState: unknown;
}) {
  const { moduleId, layoutId, brickState } = props;
  const id = Schema.decodeUnknownSync(Schema.toType(brickV1.attributesSchema.fields.moduleId))(moduleId);
  const module = freshLibrary[id];
  const spec = module.layouts[layoutId];
  if (!Object.hasOwn(module.layouts, layoutId) || spec === undefined)
    throw new Error(`Unknown ${moduleId} Brick layout: ${layoutId}`);
  return module.resolve === undefined ? spec : module.resolve({ layoutId, brickState, spec });
}
