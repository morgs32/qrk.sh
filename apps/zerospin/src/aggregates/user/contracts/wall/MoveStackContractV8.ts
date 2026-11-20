import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { moveStackV7 } from "./MoveStackContractV7";

export const moveStackV8 = upgradeAggregateContractRelease(moveStackV7, {
  version: 8,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  down: Effect.fn("moveStackV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
