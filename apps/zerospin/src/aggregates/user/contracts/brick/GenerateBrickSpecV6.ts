import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { generateBrickSpecV5 } from "./GenerateBrickSpecV5";
import { generateBrickSpecExternalDefinitionV6 } from "./GenerateBrickSpecExternalDefinitionV6";

export const generateBrickSpecV6 = upgradeAggregateContractRelease(generateBrickSpecV5, {
  version: 6,
  payload: {},
  models: { brick },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV6.externalOperation },
  down: Effect.fn("generateBrickSpecV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
