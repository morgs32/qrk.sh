import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { updateSiteSettingsV4 } from "./UpdateSiteSettingsV4";

export const updateSiteSettingsV5 = upgradeAggregateContractRelease(updateSiteSettingsV4, {
  version: 5,
  payload: {},
  models: { brick },
  down: Effect.fn("updateSiteSettingsV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
});
