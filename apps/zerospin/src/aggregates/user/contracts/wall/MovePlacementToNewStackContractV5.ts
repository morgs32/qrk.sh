import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { movePlacementToNewStackV4 } from "./MovePlacementToNewStackContractV4";

export const movePlacementToNewStackV5 = upgradeAggregateContractRelease(
  movePlacementToNewStackV4,
  {
    version: 5,
    payload: {},
    models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
    down: Effect.fn("movePlacementToNewStackV5.down")(function* (props) {
      const { payload } = props;
      return payload;
    }),
  },
);
