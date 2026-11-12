import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { movePlacementToNewRowV5 } from "./MovePlacementToNewRowContractV5";

export const movePlacementToNewRowV6 = upgradeAggregateContractRelease(movePlacementToNewRowV5, {
  version: 6,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewRowV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
