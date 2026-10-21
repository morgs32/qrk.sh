import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";

import { updateSiteSettingsV2 } from "./UpdateSiteSettingsV2";

export const updateSiteSettingsV3 = upgradeAggregateContractVersion(updateSiteSettingsV2, {
  operations: { updateSite: Site.operations.update },
  payload: {
    cardStyle: primitives.boolean({ defaultValue: false }),
    stickyNavbar: primitives.boolean({ defaultValue: true }),
  },
  up: Effect.fn("updateSiteSettingsV3.up")(function* (props) {
    const { payload } = props;
    return { ...payload, cardStyle: false, stickyNavbar: true };
  }),
  down: Effect.fn("updateSiteSettingsV3.down")(function* (props) {
    const { payload } = props;
    const { cardStyle, stickyNavbar, ...previous } = payload;
    void cardStyle;
    void stickyNavbar;
    return previous;
  }),
  models: { user: User, site: Site },
  guard: Effect.fn("updateSiteSettingsV3.guard")(function* (props) {
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
  program: Effect.fn("updateSiteSettingsV3")(function* (props) {
    const { operations, payload } = props;
    yield* operations.updateSite({
      resourceId: payload.id,
      attributes: {
        name: payload.name,
        description: payload.description,
        logoUrl: payload.logoUrl,
        faviconLightUrl: payload.faviconLightUrl,
        faviconDarkUrl: payload.faviconDarkUrl,
        cardStyle: payload.cardStyle,
        stickyNavbar: payload.stickyNavbar,
      },
    });
  }),
  version: "3.0.0",
});
