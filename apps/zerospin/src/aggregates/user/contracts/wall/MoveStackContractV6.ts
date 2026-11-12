import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { moveStackV5 } from "./MoveStackContractV5";

export const moveStackV6 = upgradeAggregateContractRelease(moveStackV5, {
  version: 6,
  payload: {},
  models: { brick },
  down: Effect.fn("moveStackV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
