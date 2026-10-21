import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";

import { createSiteV2 } from "./CreateSiteV2";

export const createSiteV3 = upgradeAggregateContractVersion(createSiteV2, {
  operations: { createSite: Site.operations.create },
  payload: {},
  up: Effect.fn("createSiteV3.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("createSiteV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { user: User, site: Site },
  guard: Effect.fn("createSiteV3.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
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

    const SlugSchema = Schema.String.check(
      Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      Schema.isTrimmed(),
    );
    if (!Schema.is(SlugSchema)(payload.slug)) {
      return yield* failures.siteSlugInvalid.make({
        message: "Use lowercase letters, numbers, and single hyphens between words",
        status: 400,
      });
    }

    const existingSite = yield* sdk.findFirst({
      db,
      model: Site,
      where: { userId: { eq: payload.userId }, slug: { eq: payload.slug } },
    });
    if (existingSite !== undefined) {
      return yield* failures.siteSlugTaken.make({
        message: `You already have a site with the slug ${payload.slug}`,
        status: 409,
      });
    }
  }),
  program: Effect.fn("createSiteV3")(function* (props) {
    const { operations, failures, payload, claims } = props;
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
        isPublished: false,
        cardStyle: false,
        stickyNavbar: true,
      },
    });
  }),
  version: "3.0.0",
});
