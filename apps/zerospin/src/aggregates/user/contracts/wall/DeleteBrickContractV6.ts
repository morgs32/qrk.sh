import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { deleteBrickV5 } from "./DeleteBrickContractV5";

export const deleteBrickV6 = upgradeAggregateContractRelease(deleteBrickV5, {
  version: 6,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteBrickV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
