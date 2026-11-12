import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowWidthWeightsV2 } from "./SetRowWidthWeightsV2";

export const setRowWidthWeightsV3 = upgradeAggregateContractRelease(setRowWidthWeightsV2, {
  version: 3,
  payload: {},
  models: { wall },
  down: Effect.fn("setRowWidthWeightsV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
