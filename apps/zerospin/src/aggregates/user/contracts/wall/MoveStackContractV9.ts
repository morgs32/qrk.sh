import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { moveStackV8 } from "./MoveStackContractV8";

export const moveStackV9 = upgradeAggregateContractRelease(moveStackV8, {
  version: 9,
  payload: {},
  models: { brick },
  down: Effect.fn("moveStackV9.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
