import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { generateBrickSpecV8 } from "./GenerateBrickSpecV8";
import { generateBrickSpecExternalDefinitionV9 } from "./GenerateBrickSpecExternalDefinitionV9";

export const generateBrickSpecV9 = upgradeAggregateContractRelease(generateBrickSpecV8, {
  version: 9,
  payload: {},
  models: { brick },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV9.externalOperation },
  down: Effect.fn("generateBrickSpecV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
