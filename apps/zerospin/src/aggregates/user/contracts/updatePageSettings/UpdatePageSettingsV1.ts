import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV2 as Page } from "../../models/page/PageV2";
import { siteV2 as Site } from "../../models/site/SiteV2";
import { userV1 as User } from "../../models/user/UserV1";

import { updatePageSettings } from "./updatePageSettings";

const updatePageSettingsPayload = {
  id: primitives.foreignKey({ abbreviation: Page.abbreviation }),
  title: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const updatePageSettingsV1 = makeContractVersion(updatePageSettings, {
  payload: updatePageSettingsPayload,
  models: { user: User, site: Site, page: Page },
  guard: Effect.fn("updatePageSettings.guard")(function* ({
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
              page: typeof Page;
              site: typeof Site;
              user: typeof User;
            },
            Record<never, never>
          >
        >,
        "query"
      >
    >;
    payload: InferCommandPayload<typeof updatePageSettingsPayload>;
  }) {
    const clerkUserId = authentication?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* new ZerospinError({
        code: "update-page-settings-user-mismatch",
        message: "Updating page settings requires an authenticated user",
        status: 403,
      });
    }

    const page = db.query.page
      .findFirst({
        where: { id: { eq: payload.id } },
      })
      .sync();

    if (page === undefined) {
      return yield* new ZerospinError({
        code: "update-page-settings-not-found",
        message: `Page ${payload.id} was not found`,
        status: 404,
      });
    }

    if (page.siteId === null) {
      return yield* new ZerospinError({
        code: "update-page-settings-site-not-found",
        message: `Page ${payload.id} has no site`,
        status: 404,
      });
    }

    const site = db.query.site
      .findFirst({
        where: { id: { eq: page.siteId } },
      })
      .sync();

    if (site === undefined) {
      return yield* new ZerospinError({
        code: "update-page-settings-site-not-found",
        message: `Site ${page.siteId} was not found`,
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
        code: "update-page-settings-user-mismatch",
        message: `Page ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) =>
    Effect.all({
      updated: models.page.update({
        resourceId: payload.id,
        attributes: {
          title: payload.title,
          description: payload.description,
        },
      }),
    }),
  version: "1.0.0",
});
