import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { updateSiteSettingsV3 } from "./UpdateSiteSettingsV3";

export const updateSiteSettingsV4 = upgradeAggregateContractRelease(updateSiteSettingsV3, {
  version: 4,
  payload: {},
  models: { brick },
  down: Effect.fn("updateSiteSettingsV4.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
