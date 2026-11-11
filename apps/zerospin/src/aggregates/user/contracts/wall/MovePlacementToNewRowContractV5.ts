import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { movePlacementToNewRowV4 } from "./MovePlacementToNewRowContractV4";

export const movePlacementToNewRowV5 = upgradeAggregateContractRelease(movePlacementToNewRowV4, {
  version: 5,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewRowV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
