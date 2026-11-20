import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { updateSiteSettingsV5 } from "./UpdateSiteSettingsV5";

export const updateSiteSettingsV6 = upgradeAggregateContractRelease(updateSiteSettingsV5, {
  version: 6,
  payload: {},
  models: { wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] } },
  down: Effect.fn("updateSiteSettingsV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
