import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { updateBrickV9 } from "./UpdateBrickV9";

export const updateBrickV10 = upgradeAggregateContractRelease(updateBrickV9, {
  version: 10,
  payload: {},
  models: { wall },
  down: Effect.fn("updateBrickV10.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
