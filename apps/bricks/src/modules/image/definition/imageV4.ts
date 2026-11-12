import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Schema } from "effect";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { image } from "./image";
import { imageV3 } from "./imageV3";

export const imageV4 = makeModuleVersion(image, {
  ...imageV3,
  version: 4,
  stateShape: {
    ...imageV3.stateShape,
    round: primitives.boolean({ defaultValue: false }),
  },
});

export const imageStateSchemaV4 = makeEffectSchema(imageV4.stateShape);

export const completeImageStateSchemaV4 = imageStateSchemaV4.check(
  Schema.makeFilter(({ imageUrl, altText }) =>
    (imageUrl.trim().length > 0 && altText.trim().length > 0) ||
    "An image and alt text are required",
  ),
  Schema.makeFilter(({ round, caption }) =>
    (!round || caption.trim().length === 0) || "A round image cannot have a caption",
  ),
);
