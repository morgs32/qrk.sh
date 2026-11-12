import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { deleteBrickV7 } from "./DeleteBrickContractV7";

export const deleteBrickV8 = upgradeAggregateContractRelease(deleteBrickV7, {
  version: 8,
  payload: {},
  models: { brick },
  operations: { deleteBrick: brick.operations.delete },
  down: Effect.fn("deleteBrickV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
