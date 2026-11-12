import { defineAggregateExternalContract, modelId } from "@zerospin/sdk/browser";
import { primitives } from "@zerospin/shapes";

import { brick as brickIdentity } from "../../models/brick/brick";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { wallV3 as wall } from "../../models/wall/WallV3";

import { libraryGenerateSpecResponse } from "./GenerateBrickSpecExternalDefinitionV1";

export const generateBrickSpecExternalDefinitionV6 = defineAggregateExternalContract({
  name: "generateBrickSpecExternal",
  version: 6,
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
