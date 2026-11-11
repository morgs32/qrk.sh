import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { updateSiteSettingsV2 } from "./UpdateSiteSettingsV2";

export const updateSiteSettingsV3 = upgradeAggregateContractRelease(updateSiteSettingsV2, {
  version: 3,
  payload: {},
  models: { wall },
  down: Effect.fn("updateSiteSettingsV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
