import { ContractError } from "@zerospin/error";
import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV2 as Site } from "../../models/site/SiteV2";
import { userV1 as User } from "../../models/user/UserV1";

import { updateSiteSettingsV1 } from "./UpdateSiteSettingsV1";

export const updateSiteSettingsV2 = upgradeAggregateContractVersion(updateSiteSettingsV1, {
  operations: { updateSite: Site.operations.update },
  failures: {
    updateSiteSettingsUserMismatch: ContractError.schema({
      code: "update-site-settings-user-mismatch",
    }),
    updateSiteSettingsNotFound: ContractError.schema({ code: "update-site-settings-not-found" }),
  },

  payload: {},
  up: Effect.fn("updateSiteSettingsV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("updateSiteSettingsV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { user: User, site: Site },
  guard: Effect.fn("updateSiteSettingsV2.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: "Updating site settings requires an authenticated user",
        status: 403,
      });
    }

    const site = yield* sdk.findFirst({ db, model: Site, where: { id: { eq: payload.id } } });

    if (site === undefined) {
      return yield* failures.updateSiteSettingsNotFound.make({
        message: `Site ${payload.id} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : yield* sdk.findFirst({ db, model: User, where: { id: { eq: site.userId } } });

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: `Site ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: Effect.fn("updateSiteSettingsV2")(function* (props) {
    const { operations, payload } = props;
    yield* operations.updateSite({
      resourceId: payload.id,
      attributes: {
        name: payload.name,
        description: payload.description,
        logoUrl: payload.logoUrl,
        faviconLightUrl: payload.faviconLightUrl,
        faviconDarkUrl: payload.faviconDarkUrl,
      },
    });
  }),
  version: "2.0.0",
});
