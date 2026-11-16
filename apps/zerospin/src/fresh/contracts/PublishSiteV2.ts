import { AggregateError, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { Effect } from "effect";
import { publishSiteV1 } from "./PublishSiteV1";

export const publishSiteV2 = upgradeAggregateContractRelease(publishSiteV1, {
  version: 2,
  payload: {},
  operations: { updateSite: siteV2.operations.update },
  failures: {
    ...publishSiteV1.failures,
    usernameRequired: AggregateError.schema({ code: "publish-site-username-required" }),
  },
  down: (props) => {
    const { payload } = props;
    return Effect.succeed(payload);
  },
});
