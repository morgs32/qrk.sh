import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { deleteBrickV4 } from "./DeleteBrickContractV4";

export const deleteBrickV5 = upgradeAggregateContractRelease(deleteBrickV4, {
  version: 5,
  payload: {},
  models: { brick },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteBrickV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
