import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { setRowWidthWeightsV1 } from "./SetRowWidthWeightsV1";

export const setRowWidthWeightsV2 = upgradeAggregateContractRelease(setRowWidthWeightsV1, {
  version: 2,
  payload: {},
  models: { wall },
  down: Effect.fn("setRowWidthWeightsV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
