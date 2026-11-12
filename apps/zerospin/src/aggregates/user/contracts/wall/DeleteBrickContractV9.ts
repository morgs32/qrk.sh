import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { deleteBrickV8 } from "./DeleteBrickContractV8";

export const deleteBrickV9 = upgradeAggregateContractRelease(deleteBrickV8, {
  version: 9,
  payload: {},
  models: { brick },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteBrickV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
