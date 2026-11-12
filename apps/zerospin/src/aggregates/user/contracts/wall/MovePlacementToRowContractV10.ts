import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { movePlacementToRowV9 } from "./MovePlacementToRowContractV9";

export const movePlacementToRowV10 = upgradeAggregateContractRelease(movePlacementToRowV9, {
  version: 10,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToRowV10.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
