import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { movePlacementToNewSectionV3 } from "./MovePlacementToNewSectionContractV3";

export const movePlacementToNewSectionV4 = upgradeAggregateContractRelease(
  movePlacementToNewSectionV3,
  {
    version: 4,
    payload: {},
    models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
    operations: { updateWall: wall.operations.update },
    down: Effect.fn("movePlacementToNewSectionV4.down")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
);
