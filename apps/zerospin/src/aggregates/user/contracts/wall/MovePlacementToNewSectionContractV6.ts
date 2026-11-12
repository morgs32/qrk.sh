import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { movePlacementToNewSectionV5 } from "./MovePlacementToNewSectionContractV5";

export const movePlacementToNewSectionV6 = upgradeAggregateContractRelease(movePlacementToNewSectionV5, {
  version: 6,
  payload: {},
  models: { brick },
  down: Effect.fn("movePlacementToNewSectionV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
