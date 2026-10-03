import type { IDb, IResourceDbConfig } from "@zerospin/core/drizzle/types";
import type { InferCommandPayload } from "@zerospin/core/models/types";
import { makeContractVersion, primitives, ZerospinError } from "@zerospin/sdk/browser";
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

export const createSiteV1 = makeContractVersion(createSite, {
  payload: createSitePayload,
  models: { user: User, site: Site },
  guard: Effect.fn("createSite.guard")(function* (props: {
    claims: Readonly<Record<string, unknown>> | null;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<{ user: typeof User }, Record<never, never>>>, "query">
    >;
    payload: InferCommandPayload<typeof createSitePayload>;
  }) {
    const { claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* new ZerospinError({
        code: "create-site-user-mismatch",
        message: "Creating a site requires an authenticated user",
        status: 403,
      });
    }

    const user = db.query.user
      .findFirst({
        where: { id: { eq: payload.userId }, clerkUserId: { eq: clerkUserId } },
      })
      .sync();

    if (user === undefined) {
      return yield* new ZerospinError({
        code: "create-site-user-mismatch",
        message: `User ${payload.userId} was not found for authenticated identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: (props) => {
    const { payload, models, claims } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return Effect.fail(
        new ZerospinError({
          code: "create-site-user-mismatch",
          message: "Creating a site requires an authenticated user",
          status: 403,
        }),
      );
    }
    const { id, slug, name, description } = payload;
    return models.site.create({
      resourceId: id,
      attributes: {
        userId: payload.userId,
        slug,
        name,
        description,
        logoUrl: null,
        faviconLightUrl: null,
        faviconDarkUrl: null,
      },
    });
  },
  version: "1.0.0",
});
