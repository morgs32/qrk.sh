import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { unpublishSiteV1 } from "./UnpublishSiteV1";

export const unpublishSiteV2 = upgradeAggregateContractVersion(unpublishSiteV1, {
  version: "2.0.0",
  down: Effect.fn("unpublishSiteV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site },
  operations: { updateSite: Site.operations.update },
});
