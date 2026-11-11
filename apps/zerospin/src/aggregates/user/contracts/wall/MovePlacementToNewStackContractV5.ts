import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { movePlacementToNewStackV4 } from "./MovePlacementToNewStackContractV4";

export const movePlacementToNewStackV5 = upgradeAggregateContractRelease(
  movePlacementToNewStackV4,
  {
    version: 5,
    payload: {},
    models: { brick },
    down: Effect.fn("movePlacementToNewStackV5.down")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
);
