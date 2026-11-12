import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { setBrickBorderWidthV3 } from "./SetBrickBorderWidthV3";

export const setBrickBorderWidthV4 = upgradeAggregateContractRelease(setBrickBorderWidthV3, {
  version: 4,
  payload: {},
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("setBrickBorderWidthV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
