import { defineAggregateExternalContract, modelId } from "@zerospin/sdk/browser";
import { primitives } from "@zerospin/shapes";

import { brick as brickIdentity } from "../../models/brick/brick";
import { brickV2 as brick } from "../../models/brick/BrickV2";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { wallV1 as wall } from "../../models/wall/WallV1";

import { libraryGenerateSpecResponse } from "./GenerateBrickSpecExternalDefinitionV1";

export const generateBrickSpecExternalDefinitionV2 = defineAggregateExternalContract({
  name: "generateBrickSpecExternal",
  version: 2,
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
