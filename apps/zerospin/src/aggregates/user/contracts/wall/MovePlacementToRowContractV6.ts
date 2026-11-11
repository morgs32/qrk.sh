import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { movePlacementToRowV5 } from "./MovePlacementToRowContractV5";

export const movePlacementToRowV6 = upgradeAggregateContractRelease(movePlacementToRowV5, {
  version: 6,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToRowV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
