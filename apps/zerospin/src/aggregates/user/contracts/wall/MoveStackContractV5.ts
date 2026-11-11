import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { moveStackV4 } from "./MoveStackContractV4";

export const moveStackV5 = upgradeAggregateContractRelease(moveStackV4, {
  version: 5,
  payload: {},
  models: { brick },
  down: Effect.fn("moveStackV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
