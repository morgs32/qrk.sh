import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { movePlacementToNewRowV8 } from "./MovePlacementToNewRowContractV8";

export const movePlacementToNewRowV9 = upgradeAggregateContractRelease(movePlacementToNewRowV8, {
  version: 9,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewRowV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
