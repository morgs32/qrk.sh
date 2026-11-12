import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { movePlacementToRowV8 } from "./MovePlacementToRowContractV8";

export const movePlacementToRowV9 = upgradeAggregateContractRelease(movePlacementToRowV8, {
  version: 9,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToRowV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
