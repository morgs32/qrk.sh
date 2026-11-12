import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { deleteStackV2 } from "./DeleteStackContractV2";

export const deleteStackV3 = upgradeAggregateContractRelease(deleteStackV2, {
  version: 3,
  payload: {},
  models: { brick },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteStackV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
