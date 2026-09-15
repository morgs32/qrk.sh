import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV2 as Site } from "../../models/site/SiteV2";
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

export const updateSiteSettingsV1 = makeContractVersion(updateSiteSettings, {
  payload: updateSiteSettingsPayload,
  models: { user: User, site: Site },
  guard: Effect.fn("updateSiteSettings.guard")(function* ({
    authentication,
    db,
    payload,
  }: {
    authentication: Readonly<Record<string, unknown>> | null;
    db: Readonly<
      Pick<
        IDb<
          IResourceDbConfig<
            {
              site: typeof Site;
              user: typeof User;
            },
            Record<never, never>
          >
        >,
        "query"
      >
    >;
    payload: InferCommandPayload<typeof updateSiteSettingsPayload>;
  }) {
    const clerkUserId = authentication?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* new ZerospinError({
        code: "update-site-settings-user-mismatch",
        message: "Updating site settings requires an authenticated user",
        status: 403,
      });
    }

    const site = db.query.site
      .findFirst({
        where: { id: { eq: payload.id } },
      })
      .sync();

    if (site === undefined) {
      return yield* new ZerospinError({
        code: "update-site-settings-not-found",
        message: `Site ${payload.id} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : db.query.user
            .findFirst({
              where: { id: { eq: site.userId } },
            })
            .sync();

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* new ZerospinError({
        code: "update-site-settings-user-mismatch",
        message: `Site ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) =>
    Effect.all({
      updated: models.site.update({
        resourceId: payload.id,
        attributes: {
          name: payload.name,
          description: payload.description,
          logoUrl: payload.logoUrl,
          faviconLightUrl: payload.faviconLightUrl,
          faviconDarkUrl: payload.faviconDarkUrl,
        },
      }),
    }),
  version: "1.0.0",
});
