import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { insertStackV2 } from "./InsertStackContractV2";

export const insertStackV3 = upgradeAggregateContractRelease(insertStackV2, {
  version: 3,
  payload: {},
  models: { brick: { model: brick, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] } },
  down: Effect.fn("insertStackV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
