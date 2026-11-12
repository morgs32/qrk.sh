import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { setBrickBorderWidthV4 } from "./SetBrickBorderWidthV4";

export const setBrickBorderWidthV5 = upgradeAggregateContractRelease(setBrickBorderWidthV4, {
  version: 5,
  payload: {},
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("setBrickBorderWidthV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
