import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { generateBrickSpecV7 } from "./GenerateBrickSpecV7";
import { generateBrickSpecExternalDefinitionV8 } from "./GenerateBrickSpecExternalDefinitionV8";

export const generateBrickSpecV8 = upgradeAggregateContractRelease(generateBrickSpecV7, {
  version: 8,
  payload: {},
  models: { brick },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV8.externalOperation },
  down: Effect.fn("generateBrickSpecV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
