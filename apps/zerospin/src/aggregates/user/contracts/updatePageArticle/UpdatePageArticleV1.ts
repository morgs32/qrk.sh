import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { TiptapDocSchema } from "@qrk.sh/library/TiptapDocSchema";
import { Effect } from "effect";
import { pageV1 as Page } from "../../models/page/PageV1";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { updatePageArticle } from "./updatePageArticle";

const updatePageArticlePayload = {
  id: primitives.foreignKey({ abbreviation: Page.abbreviation }),
  article: primitives.json({
    schema: TiptapDocSchema,
  }),
};

export const updatePageArticleV1 = makeContractVersion(updatePageArticle, {
  payload: updatePageArticlePayload,
  models: { user: User, site: Site, page: Page },
  guard: Effect.fn("updatePageArticle.guard")(function* ({
    identity,
    queryDb: db,
    payload,
  }: {
    identity: Readonly<Record<string, unknown>> | null;
    queryDb: Readonly<
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
    payload: InferCommandPayload<typeof updatePageArticlePayload>;
  }) {
    const clerkUserId = identity?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* new ZerospinError({
        code: "update-page-article-user-mismatch",
        message: "Updating page article requires an authenticated user",
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
        code: "update-page-article-not-found",
        message: `Page ${payload.id} was not found`,
        status: 404,
      });
    }

    if (page.siteId === null) {
      return yield* new ZerospinError({
        code: "update-page-article-site-not-found",
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
        code: "update-page-article-site-not-found",
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
        code: "update-page-article-user-mismatch",
        message: `Page ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) =>
    Effect.all([
      models.page.update({
        resourceId: payload.id,
        attributes: {
          article: payload.article,
        },
      }),
    ]),
  version: "1.0.0",
});
