import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { moveStackV4 } from "./MoveStackContractV4";

export const moveStackV5 = upgradeAggregateContractRelease(moveStackV4, {
  version: 5,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  down: Effect.fn("moveStackV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
