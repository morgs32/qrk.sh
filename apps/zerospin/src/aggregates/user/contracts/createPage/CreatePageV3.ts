import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { createPageV2 } from "./CreatePageV2";

export const createPageV3 = upgradeAggregateContractRelease(createPageV2, {
  version: 3,
  payload: {},
  models: { wall },
  operations: { createWall: wall.operations.create },
  down: Effect.fn("createPageV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
