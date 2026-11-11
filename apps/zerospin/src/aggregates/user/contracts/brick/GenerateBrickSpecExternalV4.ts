import { Effect } from "effect";
import { upgradeAggregateExternalContractRelease } from "@zerospin/sdk";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { generateBrickSpecExternalV3 } from "./GenerateBrickSpecExternalV3";
import { generateBrickSpecExternalDefinitionV4 } from "./GenerateBrickSpecExternalDefinitionV4";

export const generateBrickSpecExternalV4 = upgradeAggregateExternalContractRelease(
  generateBrickSpecExternalV3,
  {
    definition: generateBrickSpecExternalDefinitionV4,
    down: Effect.fn("generateBrickSpecExternalV4.down")(function* (props) {
      const { payload, externalOutcome } = props;
      return { payload, externalOutcome };
    }),
    models: { wall, placement },
    operations: { updatePlacement: placement.operations.update },
  },
);
