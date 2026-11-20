import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { deleteBrickV7 } from "./DeleteBrickContractV7";

export const deleteBrickV8 = upgradeAggregateContractRelease(deleteBrickV7, {
  version: 8,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteBrickV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
