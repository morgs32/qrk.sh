import { defineAggregateExternalContract, modelId } from "@zerospin/sdk/browser";
import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import { brick as brickIdentity } from "../../models/brick/brick";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { wallV1 as wall } from "../../models/wall/WallV1";

export const libraryGenerateSpecResponse = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal("Left"),
    left: Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      retryable: Schema.optionalKey(Schema.Boolean),
    }),
  }),
  Schema.Struct({ _tag: Schema.Literal("Right"), right: Schema.Unknown }),
]);

export const generateBrickSpecExternalDefinitionV1 = defineAggregateExternalContract({
  name: "generateBrickSpecExternal",
  version: 1,
  payload: {
    brickId: modelId({ model: brickIdentity }),
    breakpoint: wall.attributes.breakpoint,
    moduleId: brick.attributes.moduleId,
    requestId: primitives.text(),
    prompt: primitives.text(),
    baseStateRevision: primitives.integer(),
    baseSpecRevision: primitives.integer(),
    state: brick.attributes.state,
    currentSpec: placement.attributes.spec,
  },
  response: libraryGenerateSpecResponse,
  timeoutMs: 30_000,
});
