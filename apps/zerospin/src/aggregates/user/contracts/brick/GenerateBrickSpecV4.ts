import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { generateBrickSpecV3 } from "./GenerateBrickSpecV3";
import { generateBrickSpecExternalDefinitionV4 } from "./GenerateBrickSpecExternalDefinitionV4";

export const generateBrickSpecV4 = upgradeAggregateContractRelease(generateBrickSpecV3, {
  version: 4,
  payload: {},
  models: { wall },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV4.externalOperation },
  down: Effect.fn("generateBrickSpecV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
