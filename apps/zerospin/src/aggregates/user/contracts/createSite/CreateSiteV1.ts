import { ContractError } from "@zerospin/error";
import * as sdk from "@zerospin/sdk/browser";

import { makeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
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

export const createSiteV1 = makeAggregateContractVersion(createSite, {
  operations: { createSite: Site.operations.create },
  failures: {
    createSiteUserMismatch: ContractError.schema({ code: "create-site-user-mismatch" }),
  },

  payload: createSitePayload,
  models: { user: User, site: Site },
  guard: (props) => {
    const { failures, claims, db, payload } = props;
    return Effect.gen(function* () {
      const clerkUserId = claims?.clerkUserId;

      if (typeof clerkUserId !== "string") {
        return yield* failures.createSiteUserMismatch.make({
          message: "Creating a site requires an authenticated user",
          status: 403,
        });
      }

      const user = yield* sdk.findFirst({
        db,
        model: User,
        where: { id: { eq: payload.userId }, clerkUserId: { eq: clerkUserId } },
      });

      if (user === undefined) {
        return yield* failures.createSiteUserMismatch.make({
          message: `User ${payload.userId} was not found for authenticated identity ${clerkUserId}`,
          status: 403,
        });
      }
    });
  },
  program: (props) => {
    const { operations, failures, payload, claims } = props;
    return Effect.gen(function* () {
      if (typeof claims?.clerkUserId !== "string") {
        return yield* failures.createSiteUserMismatch.make({
          message: "Creating a site requires an authenticated user",
          status: 403,
        });
      }
      const { id, userId, slug, name, description } = payload;
      yield* operations.createSite({
        resourceId: id,
        attributes: {
          userId,
          slug,
          name,
          description,
          logoUrl: null,
          faviconLightUrl: null,
          faviconDarkUrl: null,
        },
      });
    });
  },
  version: "1.0.0",
});
