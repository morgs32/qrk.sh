import { ContractError } from "@zerospin/error";
import * as sdk from "@zerospin/sdk/browser";

import { makeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
import { Channel, Effect } from "effect";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { updateSiteSettings } from "./updateSiteSettings";

const updateSiteSettingsPayload = {
  id: primitives.foreignKey({ abbreviation: Site.abbreviation }),
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

export const updateSiteSettingsV1 = makeAggregateContractVersion(updateSiteSettings, {
  failures: {
    updateSiteSettingsUserMismatch: ContractError.schema({
      code: "update-site-settings-user-mismatch",
    }),
    updateSiteSettingsNotFound: ContractError.schema({ code: "update-site-settings-not-found" }),
  },

  payload: updateSiteSettingsPayload,
  models: { user: User, site: Site },
  guard: (props) => {
    const { failures, claims, db, payload } = props;
    return Effect.gen(function* () {
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
    });
  },
  program: (props) => {
    const { payload } = props;
    return Channel.suspend(() => {
      return sdk.makeUpdateOperation({
        model: Site,
        resourceId: payload.id,
        attributes: {
          name: payload.name,
          description: payload.description,
          logoUrl: payload.logoUrl,
          faviconLightUrl: payload.faviconLightUrl,
          faviconDarkUrl: payload.faviconDarkUrl,
        },
      });
    });
  },
  version: "1.0.0",
});
