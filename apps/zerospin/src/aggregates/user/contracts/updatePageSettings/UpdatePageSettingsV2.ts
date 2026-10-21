import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV2 as Page } from "../../models/page/PageV2";
import { siteV2 as Site } from "../../models/site/SiteV2";

import { updatePageSettingsV1 } from "./UpdatePageSettingsV1";

export const updatePageSettingsV2 = upgradeAggregateContractVersion(updatePageSettingsV1, {
  operations: { updatePage: Page.operations.update },

  down: Effect.fn("updatePageSettingsV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site, page: Page },
  guard: Effect.fn("updatePageSettingsV2.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* failures.updatePageSettingsUserMismatch.make({
        message: "Updating page settings requires an authenticated user",
        status: 403,
      });
    }

    const page = yield* sdk.findFirst({ db, model: db.models.page, where: { id: { eq: payload.id } } });

    if (page === undefined) {
      return yield* failures.updatePageSettingsNotFound.make({
        message: `Page ${payload.id} was not found`,
        status: 404,
      });
    }

    if (page.siteId === null) {
      return yield* failures.updatePageSettingsSiteNotFound.make({
        message: `Page ${payload.id} has no site`,
        status: 404,
      });
    }

    const site = yield* sdk.findFirst({ db, model: db.models.site, where: { id: { eq: page.siteId } } });

    if (site === undefined) {
      return yield* failures.updatePageSettingsSiteNotFound.make({
        message: `Site ${page.siteId} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : yield* sdk.findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.updatePageSettingsUserMismatch.make({
        message: `Page ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  version: "2.0.0",
});
