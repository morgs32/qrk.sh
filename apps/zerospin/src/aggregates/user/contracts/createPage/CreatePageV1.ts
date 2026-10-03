import { libraryModule } from "@qrk.sh/library/libraryModule";
import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, prefixId, primitives, ZerospinError } from "@zerospin/sdk/browser";
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
};

export const createPageV1 = makeContractVersion(createPage, {
  payload: createPagePayload,
  models: { site: Site, user: User, page: Page, wall: libraryModule.models.wall },
  guard: Effect.fn("createPage.guard")(function* (props: {
    claims: Readonly<Record<string, unknown>> | null;
    db: Readonly<
      Pick<
        IDb<IResourceDbConfig<{ site: typeof Site; user: typeof User }, Record<never, never>>>,
        "query"
      >
    >;
    payload: InferCommandPayload<typeof createPagePayload>;
  }) {
    const { claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;
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
  program: (props) => {
    const { payload, models } = props;
    const { id, siteId, slug, title, description } = payload;
    // Create the wall before the page that references it in the same command.
    const wallId = prefixId(libraryModule.models.wall, id);
    return Effect.gen(function* () {
      yield* models.wall.create({ resourceId: wallId, attributes: { label: "Library" } });
      yield* models.page.create({
        resourceId: id,
        attributes: {
          wallId,
          siteId,
          slug,
          title,
          description,
        },
      });
    });
  },
  version: "1.0.0",
});
