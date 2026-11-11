import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { insertStackV2 } from "./InsertStackContractV2";

export const insertStackV3 = upgradeAggregateContractRelease(insertStackV2, {
  version: 3,
  payload: {},
  models: { brick },
  down: Effect.fn("insertStackV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
