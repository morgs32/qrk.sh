import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { movePlacementToNewRowV7 } from "./MovePlacementToNewRowContractV7";

export const movePlacementToNewRowV8 = upgradeAggregateContractRelease(movePlacementToNewRowV7, {
  version: 8,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewRowV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
