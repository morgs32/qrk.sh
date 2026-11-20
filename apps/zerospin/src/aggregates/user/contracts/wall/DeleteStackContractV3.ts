import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { deleteStackV2 } from "./DeleteStackContractV2";

export const deleteStackV3 = upgradeAggregateContractRelease(deleteStackV2, {
  version: 3,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteStackV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
