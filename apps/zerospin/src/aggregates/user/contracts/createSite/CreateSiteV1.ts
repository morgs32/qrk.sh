import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { contracts, primitives, ZerospinError } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { createSite } from "./createSite";

const createSitePayload = {
  id: primitives.foreignKey({ abbreviation: Site.abbreviation }),
  userId: primitives.foreignKey({ abbreviation: User.abbreviation }),
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

export const createSiteV1 = contracts.makeVersion(createSite, {
  payload: createSitePayload,
  models: { user: User, site: Site },
  guard: Effect.fn("createSite.guard")(function* ({
    userId,
    db,
    payload,
  }: {
    userId: string | null;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<{ user: typeof User }, Record<never, never>>>, "query">
    >;
    payload: InferCommandPayload<typeof createSitePayload>;
  }) {
    const user = db.query.user
      .findFirst({
        where: { id: { eq: payload.userId } },
      })
      .sync();

    if (user === undefined || user.actorId !== `actr_${userId}`) {
      return yield* new ZerospinError({
        code: "create-site-user-mismatch",
        message: `User ${payload.userId} does not belong to user ${userId}`,
        status: 403,
      });
    }
  }),
  program: ({ payload, models }) => {
    const { id, userId, slug, name, description } = payload;
    return Effect.all({
      created: models.site.create({
        resourceId: id,
        attributes: {
          userId,
          slug,
          name,
          description,
        },
      }),
    });
  },
  version: "1.1.0",
});
