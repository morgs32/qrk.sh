import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { updateBrickV4 } from "./UpdateBrickV4";

export const updateBrickV5 = upgradeAggregateContractRelease(updateBrickV4, {
  version: 5,
  payload: {},
  models: { wall },
  down: Effect.fn("updateBrickV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
