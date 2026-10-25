import { site as siteIdentity } from "../../models/site/site";

import { user as userIdentity } from "../../models/user/user";

import { ContractError } from "@zerospin/error";

import * as sdk from "@zerospin/sdk/browser";

import { modelId, makeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";

import { Effect, Schema } from "effect";

import { siteV1 as Site } from "../../models/site/SiteV1";

import { userV1 as User } from "../../models/user/UserV1";

import { createSite } from "./createSite";

const createSitePayload = {
  id: modelId({ model: siteIdentity }),
  userId: modelId({ model: userIdentity }),
  slug: primitives.text(),
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
  operations: {
    createSite: Site.operations.create,
  },
  failures: {
    createSiteUserMismatch: ContractError.schema({ code: "create-site-user-mismatch" }),
    siteSlugInvalid: ContractError.schema({ code: "site-slug-invalid" }),
    siteSlugTaken: ContractError.schema({ code: "site-slug-taken" }),
  },
  payload: createSitePayload,
  models: {
    user: User,
    site: Site,
  },
  guard: Effect.fn("createSiteV1.guard")(function* (props) {
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
  program: Effect.fn("createSiteV1")(function* (props) {
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
        brickGap: 1,
        stickyNavbar: true,
      },
    });
  }),
  version: 1,
});
