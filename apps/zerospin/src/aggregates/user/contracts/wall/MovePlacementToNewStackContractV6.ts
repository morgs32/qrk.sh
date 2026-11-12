import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { movePlacementToNewStackV5 } from "./MovePlacementToNewStackContractV5";

export const movePlacementToNewStackV6 = upgradeAggregateContractRelease(movePlacementToNewStackV5, {
  version: 6,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewStackV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
