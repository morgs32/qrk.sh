import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV3 as Page } from "../../models/page/PageV3";
import { siteV3 as Site } from "../../models/site/SiteV3";

import { updatePageSettingsV2 } from "./UpdatePageSettingsV2";

export const updatePageSettingsV3 = upgradeAggregateContractVersion(updatePageSettingsV2, {
  operations: { updatePage: Page.operations.update },
  down: Effect.fn("updatePageSettingsV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site, page: Page },
  version: "3.0.0",
});
