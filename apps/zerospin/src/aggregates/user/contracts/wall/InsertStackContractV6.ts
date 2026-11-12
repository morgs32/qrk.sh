import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { insertStackV5 } from "./InsertStackContractV5";

export const insertStackV6 = upgradeAggregateContractRelease(insertStackV5, {
  version: 6,
  payload: {},
  models: { brick },
  down: Effect.fn("insertStackV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
