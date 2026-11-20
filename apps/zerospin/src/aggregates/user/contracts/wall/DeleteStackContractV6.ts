import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { deleteStackV5 } from "./DeleteStackContractV5";

export const deleteStackV6 = upgradeAggregateContractRelease(deleteStackV5, {
  version: 6,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteStackV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
