import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { setRowPreferredWidthV1 } from "./SetRowPreferredWidthV1";

export const setRowPreferredWidthV2 = upgradeAggregateContractRelease(setRowPreferredWidthV1, {
  version: 2,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("setRowPreferredWidthV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
