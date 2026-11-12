import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { updateSiteSettingsV6 } from "./UpdateSiteSettingsV6";

export const updateSiteSettingsV7 = upgradeAggregateContractRelease(updateSiteSettingsV6, {
  version: 7,
  payload: {},
  models: { brick },
  down: Effect.fn("updateSiteSettingsV7.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
