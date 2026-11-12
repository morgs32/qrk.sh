import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { movePlacementToNewSectionV7 } from "./MovePlacementToNewSectionContractV7";

export const movePlacementToNewSectionV8 = upgradeAggregateContractRelease(movePlacementToNewSectionV7, {
  version: 8,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewSectionV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
