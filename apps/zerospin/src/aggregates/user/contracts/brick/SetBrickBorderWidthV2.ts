import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { setBrickBorderWidthV1 } from "./SetBrickBorderWidthV1";

export const setBrickBorderWidthV2 = upgradeAggregateContractRelease(setBrickBorderWidthV1, {
  version: 2,
  payload: {},
  models: { brick },
  operations: { updateBrick: brick.operations.update },
  down: Effect.fn("setBrickBorderWidthV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
