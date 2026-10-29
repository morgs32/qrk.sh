import { site as siteIdentity } from "../../models/site/site";

import { ContractError } from "@zerospin/error";

import * as sdk from "@zerospin/sdk/browser";

import { modelId, makeAggregateContractRelease, primitives } from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { siteV1 as Site } from "../../models/site/SiteV1";

import { userV1 as User } from "../../models/user/UserV1";

import { updateSiteSettings } from "./updateSiteSettings";

const updateSiteSettingsPayload = {
  id: modelId({ model: siteIdentity }),
  name: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  logoUrl: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  faviconLightUrl: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  faviconDarkUrl: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const updateSiteSettingsV1 = makeAggregateContractRelease(updateSiteSettings, {
  operations: {
    updateSite: Site.operations.update,
  },
  failures: {
    updateSiteSettingsUserMismatch: ContractError.schema({
      code: "update-site-settings-user-mismatch",
    }),
    updateSiteSettingsNotFound: ContractError.schema({ code: "update-site-settings-not-found" }),
    siteBrickGapInvalid: ContractError.schema({ code: "site-brick-gap-invalid" }),
  },
  payload: {
    ...updateSiteSettingsPayload,
    cardStyle: primitives.boolean({ defaultValue: false }),
    brickGap: primitives.integer({ defaultValue: 1 }),
    stickyNavbar: primitives.boolean({ defaultValue: true }),
  },
  models: {
    user: User,
    site: Site,
  },
  guard: Effect.fn("updateSiteSettingsV1.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* failures.updateSiteSettingsUserMismatch.make({
        message: "Updating site settings requires an authenticated user",
        status: 403,
      });
    }

    const site = yield* sdk.findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: payload.id } },
    });

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

    if (payload.brickGap < 0 || payload.brickGap > 12) {
      return yield* failures.siteBrickGapInvalid.make({
        message: "Brick gap must be a whole number from 0 to 12 pixels",
        status: 400,
      });
    }
  }),
  program: Effect.fn("updateSiteSettingsV1")(function* (props) {
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
        brickGap: payload.brickGap,
        stickyNavbar: payload.stickyNavbar,
      },
    });
  }),
  version: 1,
});
