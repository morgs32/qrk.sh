import { makeEffectSchema, primitives } from "@zerospin/shapes";
import { Effect, Schema } from "effect";

import { makeModuleVersion } from "../../definition/makeModuleVersion";
import { image } from "./image";
import { imageV1 } from "./imageV1";

const focalCoordinate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

export const imageCropSchema = Schema.Struct({
  x: focalCoordinate,
  y: focalCoordinate,
  zoom: Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
});

export const imageV2 = makeModuleVersion(image, {
  ...imageV1,
  version: 2,
  stateShape: {
    ...imageV1.stateShape,
    crop: primitives.json({ schema: imageCropSchema, nullable: true, defaultValue: null }),
  },
});

export const imageStateSchema = Schema.Struct({
  ...makeEffectSchema(imageV1.stateShape).fields,
  crop: Schema.NullOr(imageCropSchema).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null)),
  ),
});
