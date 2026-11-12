import { upgradeAggregateExternalContractRelease } from "@zerospin/sdk";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { generateBrickSpecExternalV6 } from "./GenerateBrickSpecExternalV6";
import { generateBrickSpecExternalDefinitionV7 } from "./GenerateBrickSpecExternalDefinitionV7";

export const generateBrickSpecExternalV7 = upgradeAggregateExternalContractRelease(
  generateBrickSpecExternalV6,
  {
    definition: generateBrickSpecExternalDefinitionV7,
    models: { wall },
    down: Effect.fn("generateBrickSpecExternalV7.down")(function* (props) {
      const { payload, externalOutcome } = props;
      return { payload, externalOutcome };
    }),
  },
);
