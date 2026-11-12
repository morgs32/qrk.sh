import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { setBrickBorderWidthV2 } from "./SetBrickBorderWidthV2";

export const setBrickBorderWidthV3 = upgradeAggregateContractRelease(setBrickBorderWidthV2, {
  version: 3,
  payload: {},
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("setBrickBorderWidthV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
