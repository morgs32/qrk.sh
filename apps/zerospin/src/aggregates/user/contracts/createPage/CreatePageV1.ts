import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { contracts, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV1 as Page } from "../../models/page/PageV1";
import { siteV1 as Site } from "../../models/site/SiteV1";
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
};

export const createPageV1 = contracts.makeVersion(createPage, {
  payload: createPagePayload,
  models: { site: Site, user: User, page: Page },
  guard: Effect.fn("createPage.guard")(function* ({
    userId,
    db,
    payload,
  }: {
    userId: string | null;
    db: Readonly<
      Pick<
        IDb<IResourceDbConfig<{ site: typeof Site; user: typeof User }, Record<never, never>>>,
        "query"
      >
    >;
    payload: InferCommandPayload<typeof createPagePayload>;
  }) {
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

    if (user === undefined || user.actorId !== `actr_${userId}`) {
      return yield* new ZerospinError({
        code: "create-page-user-mismatch",
        message: `Site ${payload.siteId} does not belong to user ${userId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) => {
    const { id, siteId, slug, title, description, pageType } = payload;
    return Effect.all({
      created: models.page.create({
        resourceId: id,
        attributes: {
          siteId,
          slug,
          title,
          description,
          pageType,
        },
      }),
    });
  },
  version: "1.1.0",
});
