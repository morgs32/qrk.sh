import type { Spec } from "@json-render/core";
import { Schema } from "effect";
import { imageStateSchemaV4 } from "./imageV4";

const captioned: Spec = {
  root: "card-1",
  elements: {
    "card-1": { type: "ImageCard", props: {}, children: ["cover-1", "footer-1"] },
    "cover-1": {
      type: "ImageCover",
      props: { imageUrl: { $state: "/brickState/imageUrl" }, title: { $state: "/brickState/altText" }, imagePosition: "center" },
    },
    "footer-1": {
      type: "MediaFooter",
      props: { overline: null, heading: { $state: "/brickState/caption" }, iconUrl: null },
    },
  },
};

const captionless: Spec = {
  root: "card-1",
  elements: {
    "card-1": { type: "ImageCard", props: {}, children: ["cover-1"] },
    "cover-1": {
      type: "ImageCover",
      props: { imageUrl: { $state: "/brickState/imageUrl" }, title: { $state: "/brickState/altText" }, imagePosition: "center" },
    },
  },
};

export const freshImageLayouts: Record<string, Spec> = { default: captioned, captioned, captionless };

export function resolveImageLayout(props: { layoutId: string; brickState: unknown; spec: Spec }) {
  const { layoutId, brickState, spec } = props;
  if (brickState === null) return spec;
  const state = Schema.decodeUnknownSync(imageStateSchemaV4)(brickState, { onExcessProperty: "ignore" });
  return layoutId === "captionless" && !state.round && state.caption.trim() !== "" ? captioned : spec;
}
