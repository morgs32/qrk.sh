import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV3 as Site } from "../../models/site/SiteV3";

import { createSiteV2 } from "./CreateSiteV2";

export const createSiteV3 = upgradeAggregateContractVersion(createSiteV2, {
  operations: { createSite: Site.operations.create },
  down: Effect.fn("createSiteV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site },
  program: Effect.fn("createSiteV3")(function* (props) {
    const { operations, failures, payload, claims } = props;
    if (typeof claims?.clerkUserId !== "string") {
      return yield* failures.createSiteUserMismatch.make({
        message: "Creating a site requires an authenticated user",
        status: 403,
      });
    }
    const { id, userId, slug, name, description } = payload;
    yield* operations.createSite({
      resourceId: id,
      attributes: {
        userId,
        slug,
        name,
        description,
        logoUrl: null,
        faviconLightUrl: null,
        faviconDarkUrl: null,
        isPublished: false,
        cardStyle: false,
        stickyNavbar: true,
      },
    });
  }),
  version: "3.0.0",
});
