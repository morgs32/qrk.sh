import { defineAggregateContract } from "@zerospin/sdk/browser";
import { site as siteIdentity } from "@qrk.sh/bricks/zerospin/models/site/site";

import { user as userIdentity } from "@qrk.sh/bricks/zerospin/models/user/user";

import { ContractError } from "@zerospin/error";

import * as sdk from "@zerospin/sdk/browser";

import { modelId, makeAggregateContractRelease, primitives } from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { siteV1 as Site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";

import { userV1 as User } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

const createSite = defineAggregateContract("createSite");

const createSitePayload = {
  id: modelId({ model: siteIdentity }),
  userId: modelId({ model: userIdentity }),
  slug: primitives.text({ nullable: true }),
  name: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const createSiteV1 = makeAggregateContractRelease(createSite, {
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
    user: { model: User, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
    site: {
      model: Site,
      fields: [
        "hostname",
        "name",
        "createdAt",
        "updatedAt",
        "slug",
        "description",
        "isPublished",
        "userId",
        "logoUrl",
        "faviconLightUrl",
        "faviconDarkUrl",
        "stickyNavbar",
        "cardStyle",
        "brickGap",
      ],
    },
  },
  guard: Effect.fn("createSite.guard")(function* (props) {
    const { payload, claims, db, failures } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string")
      return yield* failures.createSiteUserMismatch.make({
        message: "Creating a Site requires authentication",
        status: 403,
      });
    const owner = yield* sdk.findFirst({
      db,
      model: db.models.user,
      where: { id: { eq: payload.userId }, clerkUserId: { eq: clerkUserId } },
    });
    if (owner === undefined)
      return yield* failures.createSiteUserMismatch.make({
        message: "Creating a Site requires its authenticated owner",
        status: 403,
      });
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
        hostname: null,
        isPublished: false,
        cardStyle: false,
        brickGap: 0,
        stickyNavbar: true,
      },
    });
  }),
  version: 1,
});
