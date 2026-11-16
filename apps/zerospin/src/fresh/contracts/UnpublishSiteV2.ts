import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { unpublishSiteV1 } from "./UnpublishSiteV1";

export const unpublishSiteV2 = upgradeAggregateContractRelease(unpublishSiteV1, {
  version: 2,
  operations: { updateSite: siteV2.operations.update },
  down: (props) => {
    const { payload } = props;
    return Effect.succeed(payload);
  },
});
