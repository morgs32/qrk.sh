import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { createPageV3 } from "./CreatePageV3";

export const createPageV4 = upgradeAggregateContractRelease(createPageV3, {
  version: 4,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { createWall: wall.operations.create },
  down: Effect.fn("createPageV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
