import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { movePlacementToNewSectionV8 } from "./MovePlacementToNewSectionContractV8";

export const movePlacementToNewSectionV9 = upgradeAggregateContractRelease(movePlacementToNewSectionV8, {
  version: 9,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewSectionV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
