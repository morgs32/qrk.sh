import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { TiptapDocSchema } from "@qrk.sh/library/TiptapDocSchema";
import { Effect } from "effect";
import { pageV2 as Page } from "../../models/page/PageV2";
import { siteV2 as Site } from "../../models/site/SiteV2";
import { userV1 as User } from "../../models/user/UserV1";

import { createPage } from "./createPage";

const createPagePayload = {
  id: primitives.foreignKey({ abbreviation: Page.abbreviation }),
  siteId: primitives.foreignKey({ abbreviation: Site.abbreviation }),
  slug: primitives.text(),
  title: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  pageType: primitives.enum({
    values: ["split-scroll", "shared-scroll"],
  }),
  article: primitives.json({
    nullable: true,
    defaultValue: null,
    schema: TiptapDocSchema,
  }),
};

export const createPageV2 = makeContractVersion(createPage, {
  payload: createPagePayload,
  models: { site: Site, user: User, page: Page },
  guard: Effect.fn("createPage.guard")(function* ({
    authentication,
    db,
    payload,
  }: {
    authentication: Readonly<Record<string, unknown>> | null;
    db: Readonly<
      Pick<
        IDb<IResourceDbConfig<{ site: typeof Site; user: typeof User }, Record<never, never>>>,
        "query"
      >
    >;
    payload: InferCommandPayload<typeof createPagePayload>;
  }) {
    const clerkUserId = authentication?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* new ZerospinError({
        code: "create-page-user-mismatch",
        message: "A Clerk user is required",
        status: 403,
      });
    }

    const site = db.query.site
      .findFirst({
        where: { id: { eq: payload.siteId } },
      })
      .sync();

    if (site === undefined) {
      return yield* new ZerospinError({
        code: "create-page-site-not-found",
        message: `Site ${payload.siteId} was not found`,
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
        code: "create-page-user-mismatch",
        message: `Site ${payload.siteId} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) => {
    const { id, siteId, slug, title, description, pageType, article } = payload;
    return Effect.all({
      created: models.page.create({
        resourceId: id,
        attributes: {
          siteId,
          slug,
          title,
          description,
          pageType,
          article,
        },
      }),
    });
  },
  version: "2.0.0",
});
