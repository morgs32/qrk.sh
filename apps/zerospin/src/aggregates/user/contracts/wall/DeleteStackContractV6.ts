import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { deleteStackV5 } from "./DeleteStackContractV5";

export const deleteStackV6 = upgradeAggregateContractRelease(deleteStackV5, {
  version: 6,
  payload: {},
  models: { brick },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteStackV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
