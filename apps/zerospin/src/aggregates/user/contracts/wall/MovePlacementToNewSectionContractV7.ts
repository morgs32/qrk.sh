import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { movePlacementToNewSectionV6 } from "./MovePlacementToNewSectionContractV6";

export const movePlacementToNewSectionV7 = upgradeAggregateContractRelease(
  movePlacementToNewSectionV6,
  {
    version: 7,
    payload: {},
    models: { wall },
    operations: { updateWall: wall.operations.update },
    down: Effect.fn("movePlacementToNewSectionV7.down")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
);
