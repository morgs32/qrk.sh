import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { updateSiteSettingsV7 } from "./UpdateSiteSettingsV7";

export const updateSiteSettingsV8 = upgradeAggregateContractRelease(updateSiteSettingsV7, {
  version: 8,
  payload: {},
  models: { brick },
  down: Effect.fn("updateSiteSettingsV8.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
