import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { movePlacementToNewStackV7 } from "./MovePlacementToNewStackContractV7";

export const movePlacementToNewStackV8 = upgradeAggregateContractRelease(movePlacementToNewStackV7, {
  version: 8,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewStackV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
