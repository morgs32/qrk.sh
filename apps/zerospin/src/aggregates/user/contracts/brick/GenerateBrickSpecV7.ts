import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { generateBrickSpecV6 } from "./GenerateBrickSpecV6";
import { generateBrickSpecExternalDefinitionV7 } from "./GenerateBrickSpecExternalDefinitionV7";

export const generateBrickSpecV7 = upgradeAggregateContractRelease(generateBrickSpecV6, {
  version: 7,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { generateSpec: generateBrickSpecExternalDefinitionV7.externalOperation },
  down: Effect.fn("generateBrickSpecV7.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
