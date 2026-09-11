import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, prefixId, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { createSite } from "./createSite";

const createSitePayload = {
  id: primitives.foreignKey({ abbreviation: Site.abbreviation }),
  slug: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  name: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const createSiteV2 = makeContractVersion(createSite, {
  payload: createSitePayload,
  models: { user: User, site: Site },
  guard: Effect.fn("createSite.guard")(function* ({
    userId,
    db,
  }: {
    userId: string | null;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<{ user: typeof User }, Record<never, never>>>, "query">
    >;
    payload: InferCommandPayload<typeof createSitePayload>;
  }) {
    if (userId === null) {
      return yield* new ZerospinError({
        code: "create-site-user-mismatch",
        message: "Creating a site requires an authenticated user",
        status: 403,
      });
    }

    const user = db.query.user
      .findFirst({
        where: { id: { eq: prefixId(User, userId) } },
      })
      .sync();

    if (user === undefined || user.clerkUserId !== userId) {
      return yield* new ZerospinError({
        code: "create-site-user-mismatch",
        message: `User ${prefixId(User, userId)} does not belong to user ${userId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models, userId }) => {
    if (userId === null) {
      return Effect.fail(
        new ZerospinError({
          code: "create-site-user-mismatch",
          message: "Creating a site requires an authenticated user",
          status: 403,
        }),
      );
    }
    const { id, slug, name, description } = payload;
    return Effect.all({
      created: models.site.create({
        resourceId: id,
        attributes: {
          userId: prefixId(User, userId),
          slug,
          name,
          description,
        },
      }),
    });
  },
  version: "2.0.0",
});
