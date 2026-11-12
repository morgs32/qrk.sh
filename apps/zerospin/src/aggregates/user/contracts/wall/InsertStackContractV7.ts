import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { insertStackV6 } from "./InsertStackContractV6";

export const insertStackV7 = upgradeAggregateContractRelease(insertStackV6, {
  version: 7,
  payload: {},
  models: { brick },
  down: Effect.fn("insertStackV7.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
