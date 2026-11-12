import type { Spec } from "@json-render/core";
import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { image } from "./image";
import { imageCropSchema, imageV2 } from "./imageV2";

const captioned: Spec = {
  root: "card-1",
  elements: {
    "card-1": { type: "ImageCard", props: {}, children: ["cover-1", "footer-1"] },
    "cover-1": {
      type: "ImageCover",
      props: { imageUrl: { $state: "/imageUrl" }, title: { $state: "/altText" }, imagePosition: "center" },
    },
    "footer-1": {
      type: "MediaFooter",
      props: { overline: null, heading: { $state: "/caption" }, iconUrl: null },
    },
  },
};

const captionless: Spec = {
  root: "card-1",
  elements: {
    "card-1": { type: "ImageCard", props: {}, children: ["cover-1"] },
    "cover-1": {
      type: "ImageCover",
      props: { imageUrl: { $state: "/imageUrl" }, title: { $state: "/altText" }, imagePosition: "center" },
    },
  },
};

export const imageLayouts: Record<string, Spec> = { default: captioned, captioned, captionless };

export const imageV3 = makeModuleVersion(image, {
  ...imageV2,
  version: 3,
  defaultSpec: captioned,
  stateShape: {
    imageUrl: primitives.text(),
    altText: primitives.text(),
    caption: primitives.text(),
    crop: primitives.json({ schema: imageCropSchema, nullable: true, defaultValue: null }),
  },
});

export const imageStateSchemaV3 = Schema.toType(makeEffectSchema(imageV3.stateShape));
export const completeImageStateSchema = imageStateSchemaV3.check(
  Schema.makeFilter(({ imageUrl, altText }) =>
    (imageUrl.trim().length > 0 && altText.trim().length > 0) ||
      "An image and alt text are required",
  ),
);
