import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { setRowWidthWeightsV1 } from "./SetRowWidthWeightsV1";

export const setRowWidthWeightsV2 = upgradeAggregateContractRelease(setRowWidthWeightsV1, {
  version: 2,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  down: Effect.fn("setRowWidthWeightsV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
