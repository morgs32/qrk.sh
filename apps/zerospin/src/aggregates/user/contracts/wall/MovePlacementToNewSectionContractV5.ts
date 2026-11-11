import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { movePlacementToNewSectionV4 } from "./MovePlacementToNewSectionContractV4";

export const movePlacementToNewSectionV5 = upgradeAggregateContractRelease(
  movePlacementToNewSectionV4,
  {
    version: 5,
    payload: {},
    models: { brick },
    down: Effect.fn("movePlacementToNewSectionV5.down")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
);
