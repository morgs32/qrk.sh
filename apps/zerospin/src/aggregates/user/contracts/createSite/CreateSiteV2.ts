import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { siteV2 as Site } from "../../models/site/SiteV2";

import { createSiteV1 } from "./CreateSiteV1";

export const createSiteV2 = upgradeAggregateContractVersion(createSiteV1, {
  operations: { createSite: Site.operations.create },

  down: Effect.fn("createSiteV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site },
  guard: Effect.fn("createSiteV2.guard")(function* (props) {
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
      model: db.models.user,
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
      model: db.models.site,
      where: { userId: { eq: payload.userId }, slug: { eq: payload.slug } },
    });
    if (existingSite !== undefined) {
      return yield* failures.siteSlugTaken.make({
        message: `You already have a site with the slug ${payload.slug}`,
        status: 409,
      });
    }
  }),
  program: Effect.fn("createSiteV2")(function* (props) {
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
      },
    });
  }),
  version: "2.0.0",
});
