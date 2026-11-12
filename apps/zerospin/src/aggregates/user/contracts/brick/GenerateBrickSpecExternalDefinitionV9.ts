import { defineAggregateExternalContract, modelId } from "@zerospin/sdk/browser";
import { primitives } from "@zerospin/shapes";

import { brick as brickIdentity } from "../../models/brick/brick";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { wallV3 as wall } from "../../models/wall/WallV3";

import { libraryGenerateSpecResponse } from "./GenerateBrickSpecExternalDefinitionV1";

export const generateBrickSpecExternalDefinitionV9 = defineAggregateExternalContract({
  name: "generateBrickSpecExternal",
  version: 9,
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
