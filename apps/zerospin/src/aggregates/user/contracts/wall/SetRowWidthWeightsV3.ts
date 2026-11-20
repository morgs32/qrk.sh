import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowWidthWeightsV2 } from "./SetRowWidthWeightsV2";

export const setRowWidthWeightsV3 = upgradeAggregateContractRelease(setRowWidthWeightsV2, {
  version: 3,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  down: Effect.fn("setRowWidthWeightsV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
