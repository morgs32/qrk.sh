import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { movePlacementToNewStackV3 } from "./MovePlacementToNewStackContractV3";

export const movePlacementToNewStackV4 = upgradeAggregateContractRelease(
  movePlacementToNewStackV3,
  {
    version: 4,
    payload: {},
    models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
    operations: { updateWall: wall.operations.update },
    down: Effect.fn("movePlacementToNewStackV4.down")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
);
