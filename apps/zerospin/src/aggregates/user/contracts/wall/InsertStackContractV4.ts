import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { insertStackV3 } from "./InsertStackContractV3";

export const insertStackV4 = upgradeAggregateContractRelease(insertStackV3, {
  version: 4,
  payload: {},
  models: { brick },
  down: Effect.fn("insertStackV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
