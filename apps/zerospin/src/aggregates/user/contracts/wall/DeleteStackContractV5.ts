import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { deleteStackV4 } from "./DeleteStackContractV4";

export const deleteStackV5 = upgradeAggregateContractRelease(deleteStackV4, {
  version: 5,
  payload: {},
  models: { brick },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteStackV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
