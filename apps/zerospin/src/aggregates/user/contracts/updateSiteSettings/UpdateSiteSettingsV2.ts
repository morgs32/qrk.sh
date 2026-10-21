import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV2 as Site } from "../../models/site/SiteV2";

import { updateSiteSettingsV1 } from "./UpdateSiteSettingsV1";

export const updateSiteSettingsV2 = upgradeAggregateContractVersion(updateSiteSettingsV1, {
  operations: { updateSite: Site.operations.update },

  down: Effect.fn("updateSiteSettingsV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site },
  guard: Effect.fn("updateSiteSettingsV2.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: "Updating site settings requires an authenticated user",
        status: 403,
      });
    }

    const site = yield* sdk.findFirst({ db, model: db.models.site, where: { id: { eq: payload.id } } });

    if (site === undefined) {
      return yield* failures.updateSiteSettingsNotFound.make({
        message: `Site ${payload.id} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : yield* sdk.findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: `Site ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  version: "2.0.0",
});
